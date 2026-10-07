// Low-level access to the fonts a PDF page uses: where they are, whether they are
// embedded, and how to turn Unicode text back into the font's own character codes
// so an edit can be drawn with the original font object.
import type { PDFDocument, PDFObject, PDFPage } from 'mupdf'
import { mupdf } from './mupdf'

export interface FontResource {
  /** Indirect object number, or -1 for a direct object. */
  num: number
  obj: PDFObject
  baseFont: string
  subtype: string
  embedded: boolean
  program?: 'TrueType' | 'Type1' | 'CFF' | 'OpenType'
  /** Unicode char -> hex code string in the font's encoding. */
  codes: Map<string, string>
  /** Bytes per code (1 for simple fonts, 2 for Identity-H Type0). */
  codeBytes: 1 | 2
  /** Whether codes can be written with this font object. */
  reusable: boolean
  /** Advance width in 1/1000 em for a hex code. */
  width: (code: string) => number
}

const SUBSET_RE = /^[A-Z]{6}\+/

export function stripSubset(name: string) {
  return name.replace(SUBSET_RE, '')
}

export function isSubsetName(name: string) {
  return SUBSET_RE.test(name)
}

/** Normalised name used to match MuPDF's runtime font names against BaseFont entries. */
export function nameKey(name: string) {
  return stripSubset(name).toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Null-safe lookup: MuPDF's Null object throws on get/resolve. */
export function at(o: PDFObject | null | undefined, ...path: (string | number)[]): PDFObject | null {
  let cur = o ?? null
  for (const k of path) {
    if (!cur || cur.isNull()) return null
    cur = cur.get(k)
  }
  return cur && !cur.isNull() ? cur : null
}

/** All font resources reachable from a page, including inside Form XObjects. */
export function pageFontResources(page: PDFPage): FontResource[] {
  const found = new Map<string, FontResource>()
  const seenXObjects = new Set<number>()

  const visit = (resources: PDFObject | null, depth: number) => {
    if (!resources || resources.isNull() || depth > 8) return
    const fonts = at(resources, 'Font')
    if (fonts?.isDictionary()) {
      fonts.forEach((ref) => {
        const num = ref.isIndirect() ? ref.asIndirect() : -1
        const key = num >= 0 ? `n${num}` : `d${found.size}`
        if (!found.has(key)) found.set(key, describeFont(ref.resolve(), num))
      })
    }
    const xobjects = at(resources, 'XObject')
    if (xobjects?.isDictionary()) {
      xobjects.forEach((ref) => {
        const num = ref.isIndirect() ? ref.asIndirect() : -1
        if (num >= 0 && seenXObjects.has(num)) return
        seenXObjects.add(num)
        const x = ref.resolve()
        if (nameOf(at(x, 'Subtype')) === 'Form') visit(at(x, 'Resources'), depth + 1)
      })
    }
  }

  visit(page.getObject().getInheritable('Resources'), 0)
  return [...found.values()]
}

export function describeFont(obj: PDFObject, num: number): FontResource {
  const subtype = nameOf(at(obj, 'Subtype'))
  const baseFont = nameOf(at(obj, 'BaseFont')) || 'Unnamed'
  const isType0 = subtype === 'Type0'
  const descendant = isType0 ? at(obj, 'DescendantFonts', 0) : null
  const descriptor = at(descendant ?? obj, 'FontDescriptor')

  let program: FontResource['program']
  let embedded = false
  if (descriptor?.isDictionary()) {
    if (at(descriptor, 'FontFile2')) [embedded, program] = [true, 'TrueType']
    else if (at(descriptor, 'FontFile')) [embedded, program] = [true, 'Type1']
    else if (at(descriptor, 'FontFile3')) {
      embedded = true
      program = nameOf(at(descriptor, 'FontFile3', 'Subtype')) === 'OpenType' ? 'OpenType' : 'CFF'
    }
  }
  if (subtype === 'Type3') embedded = true

  const toUnicode = parseToUnicode(at(obj, 'ToUnicode'))
  let codes = new Map<string, string>()
  let codeBytes: 1 | 2 = 1
  let reusable = false

  if (isType0) {
    codeBytes = 2
    const encoding = nameOf(at(obj, 'Encoding'))
    // Only Identity-H codes map one-to-one onto CIDs we can write back.
    reusable = encoding === 'Identity-H' && toUnicode.size > 0
    codes = invert(toUnicode)
  } else if (subtype === 'Type1' || subtype === 'TrueType' || subtype === 'MMType1') {
    codes = toUnicode.size > 0 ? invert(toUnicode) : simpleEncodingCodes(obj)
    reusable = codes.size > 0
  }

  return {
    num, obj, baseFont, subtype, embedded, program, codes, codeBytes, reusable,
    width: isType0 && descendant ? cidWidths(descendant) : simpleWidths(obj, baseFont),
  }
}

/** Reads a stream's decoded bytes as text. (`isStream()` is unreliable on references.) */
function readText(o: PDFObject | null) {
  if (!o) return ''
  try {
    const buffer = o.readStream()
    try {
      return buffer.asString()
    }
    finally {
      buffer.destroy()
    }
  }
  catch {
    return ''
  }
}

function nameOf(o: PDFObject | null) {
  return o && !o.isNull() && o.isName() ? o.asName() : ''
}

// --- ToUnicode CMaps -------------------------------------------------------

function utf16Hex(hex: string) {
  const units: number[] = []
  for (let i = 0; i + 4 <= hex.length; i += 4) units.push(Number.parseInt(hex.slice(i, i + 4), 16))
  return String.fromCharCode(...units)
}

/** Parses bfchar/bfrange sections into code(hex, uppercase) -> unicode string. */
export function parseToUnicode(stream: PDFObject | null): Map<string, string> {
  const map = new Map<string, string>()
  const text = readText(stream)
  if (!text) return map

  for (const section of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of section[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g))
      map.set(m[1]!.toUpperCase(), utf16Hex(m[2]!))
  }
  for (const section of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = section[1]!
    for (const m of body.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g)) {
      const width = m[1]!.length
      const lo = Number.parseInt(m[1]!, 16)
      const hi = Number.parseInt(m[2]!, 16)
      if (hi - lo > 0xffff) continue
      const toHex = (n: number) => n.toString(16).toUpperCase().padStart(width, '0')
      if (m[3]!.startsWith('[')) {
        const dsts = [...m[3]!.matchAll(/<([0-9a-fA-F]*)>/g)].map(d => utf16Hex(d[1]!))
        dsts.forEach((d, i) => map.set(toHex(lo + i), d))
      } else {
        const start = m[3]!.slice(1, -1)
        const head = start.slice(0, -4)
        const last = Number.parseInt(start.slice(-4), 16)
        for (let c = lo; c <= hi; c++) {
          const unit = (last + c - lo).toString(16).padStart(4, '0')
          map.set(toHex(c), utf16Hex(head + unit))
        }
      }
    }
  }
  return map
}

/** Unicode -> code, keeping the first (lowest) code for each single character. */
function invert(toUnicode: Map<string, string>) {
  const out = new Map<string, string>()
  const sorted = [...toUnicode.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [code, uni] of sorted) {
    if ([...uni].length === 1 && !out.has(uni)) out.set(uni, code)
  }
  return out
}

// --- Simple font encodings ---------------------------------------------------

const WIN_ANSI_HIGH: Record<number, number> = {
  0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02DC,
  0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178,
}

function baseEncodingTable(name: string): Map<number, string> {
  const table = new Map<number, string>()
  for (let c = 0x20; c <= 0x7E; c++) table.set(c, String.fromCharCode(c))
  if (name === 'WinAnsiEncoding') {
    for (let c = 0xA0; c <= 0xFF; c++) table.set(c, String.fromCharCode(c))
    for (const [k, v] of Object.entries(WIN_ANSI_HIGH)) table.set(Number(k), String.fromCharCode(v))
  } else if (name === 'StandardEncoding' || name === '') {
    table.set(0x27, '’')
    table.set(0x60, '‘')
  }
  return table
}

const ACCENTS: Record<string, string> = {
  acute: '́', grave: '̀', circumflex: '̂', dieresis: '̈', tilde: '̃',
  ring: '̊', cedilla: '̧', caron: '̌', macron: '̄', breve: '̆',
  ogonek: '̨', dotaccent: '̇', hungarumlaut: '̋',
}

const GLYPH_NAMES: Record<string, string> = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&',
  quotesingle: "'", parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',', hyphen: '-',
  period: '.', slash: '/', colon: ':', semicolon: ';', less: '<', equal: '=', greater: '>', question: '?',
  at: '@', bracketleft: '[', backslash: '\\', bracketright: ']', asciicircum: '^', underscore: '_',
  grave: '`', braceleft: '{', bar: '|', braceright: '}', asciitilde: '~', quoteright: '’',
  quoteleft: '‘', quotedblleft: '“', quotedblright: '”', quotesinglbase: '‚',
  quotedblbase: '„', endash: '–', emdash: '—', bullet: '•', ellipsis: '…',
  Euro: '€', germandbls: 'ß', ae: 'æ', AE: 'Æ', oslash: 'ø', Oslash: 'Ø',
  eth: 'ð', Eth: 'Ð', thorn: 'þ', Thorn: 'Þ', dotlessi: 'ı', lslash: 'ł',
  Lslash: 'Ł', oe: 'œ', OE: 'Œ', copyright: '©', registered: '®',
  trademark: '™', degree: '°', section: '§', paragraph: '¶', sterling: '£',
  yen: '¥', cent: '¢', currency: '¤', multiply: '×', divide: '÷',
  plusminus: '±', periodcentered: '·', guillemotleft: '«', guillemotright: '»',
  guilsinglleft: '‹', guilsinglright: '›', exclamdown: '¡', questiondown: '¿',
  nbspace: ' ', dagger: '†', daggerdbl: '‡', perthousand: '‰', florin: 'ƒ',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
}

export function glyphNameToUnicode(name: string): string | undefined {
  if (GLYPH_NAMES[name]) return GLYPH_NAMES[name]
  if (/^[A-Za-z]$/.test(name)) return name
  const uni = /^uni([0-9A-Fa-f]{4})$/.exec(name) ?? /^u([0-9A-Fa-f]{4,6})$/.exec(name)
  if (uni) return String.fromCodePoint(Number.parseInt(uni[1]!, 16))
  const accented = /^([A-Za-z])(acute|grave|circumflex|dieresis|tilde|ring|cedilla|caron|macron|breve|ogonek|dotaccent|hungarumlaut)$/.exec(name)
  if (accented) return (accented[1]! + ACCENTS[accented[2]!]).normalize('NFC')
  return undefined
}

function simpleEncodingCodes(font: PDFObject): Map<string, string> {
  const enc = at(font, 'Encoding')
  let baseName = ''
  let differences: PDFObject | null = null
  if (enc?.isName()) baseName = enc.asName()
  else if (enc?.isDictionary()) {
    baseName = nameOf(at(enc, 'BaseEncoding'))
    differences = at(enc, 'Differences')
  }
  // Symbolic fonts (Symbol, ZapfDingbats, custom) have no reliable Latin mapping.
  const base = nameOf(at(font, 'BaseFont'))
  if (!baseName && /Symbol|Dingbats/i.test(base)) return new Map()

  const table = baseEncodingTable(baseName)
  if (differences && differences.isArray()) {
    let code = 0
    differences.forEach((item) => {
      if (item.isNumber()) code = item.asNumber()
      else if (item.isName()) {
        const uni = glyphNameToUnicode(item.asName())
        if (uni) table.set(code, uni)
        else table.delete(code)
        code++
      }
    })
  }
  const out = new Map<string, string>()
  for (const [code, uni] of [...table.entries()].sort(([a], [b]) => a - b)) {
    if (!out.has(uni)) out.set(uni, code.toString(16).toUpperCase().padStart(2, '0'))
  }
  return out
}

// --- Widths ------------------------------------------------------------------

function cidWidths(descendant: PDFObject) {
  const dwObj = at(descendant, 'DW')
  const dw = dwObj?.isNumber() ? dwObj.asNumber() : 1000
  const widths = new Map<number, number>()
  const w = at(descendant, 'W')
  if (w?.isArray()) {
    const items: PDFObject[] = []
    w.forEach(v => items.push(v))
    for (let i = 0; i < items.length;) {
      const first = items[i]!.asNumber()
      const next = items[i + 1]!
      if (next.isArray()) {
        let c = first
        next.forEach((v) => { widths.set(c++, v.asNumber()) })
        i += 2
      } else {
        const last = next.asNumber()
        const value = items[i + 2]!.asNumber()
        for (let c = first; c <= last; c++) widths.set(c, value)
        i += 3
      }
    }
  }
  return (code: string) => widths.get(Number.parseInt(code, 16)) ?? dw
}

const BASE14 = /^(Helvetica|Times|Courier|Symbol|ZapfDingbats|Arial|TimesNewRoman)/

function simpleWidths(font: PDFObject, baseFont: string) {
  const firstObj = at(font, 'FirstChar')
  const first = firstObj?.isNumber() ? firstObj.asNumber() : 0
  const list: number[] = []
  const widthsObj = at(font, 'Widths')
  if (widthsObj?.isArray()) widthsObj.forEach(v => list.push(v.isNumber() ? v.asNumber() : 0))
  const missing = at(font, 'FontDescriptor', 'MissingWidth')
  const missingWidth = missing?.isNumber() ? missing.asNumber() : 0

  // Standard 14 fonts often omit Widths; use MuPDF's built-in metrics instead.
  let builtin: ReturnType<typeof builtinFont> | null = null
  if (list.length === 0 && BASE14.test(stripSubset(baseFont))) builtin = builtinFont(stripSubset(baseFont))
  const encoding = builtin ? baseEncodingTable(nameOf(at(font, 'Encoding')) || 'StandardEncoding') : null

  return (code: string) => {
    const c = Number.parseInt(code, 16)
    const listed = list[c - first]
    if (listed !== undefined) return listed
    if (builtin && encoding) {
      const uni = encoding.get(c)
      if (uni) return builtin.advanceGlyph(builtin.encodeCharacter(uni)) * 1000
    }
    return missingWidth
  }
}

const builtinCache = new Map<string, InstanceType<typeof mupdf.Font>>()
export function builtinFont(name: string) {
  const canonical = canonicalBase14(name)
  let font = builtinCache.get(canonical)
  if (!font) builtinCache.set(canonical, font = new mupdf.Font(canonical))
  return font
}

/** Maps common aliases (Arial, TimesNewRoman, ...) to a base-14 name MuPDF ships. */
export function canonicalBase14(name: string) {
  const n = stripSubset(name).replace(/[\s_]/g, '')
  const bold = /bold|black|heavy/i.test(n)
  const italic = /italic|oblique/i.test(n)
  if (/^(Times|TimesNewRoman|Georgia)/i.test(n))
    return bold && italic ? 'Times-BoldItalic' : bold ? 'Times-Bold' : italic ? 'Times-Italic' : 'Times-Roman'
  if (/^(Courier)/i.test(n))
    return bold && italic ? 'Courier-BoldOblique' : bold ? 'Courier-Bold' : italic ? 'Courier-Oblique' : 'Courier'
  if (/^Symbol/i.test(n)) return 'Symbol'
  if (/^ZapfDingbats/i.test(n)) return 'ZapfDingbats'
  return bold && italic ? 'Helvetica-BoldOblique' : bold ? 'Helvetica-Bold' : italic ? 'Helvetica-Oblique' : 'Helvetica'
}

export function isBase14Name(name: string) {
  return BASE14.test(stripSubset(name).replace(/[\s_]/g, ''))
}

/** Encodes text with the font's own codes, or returns null when any character is missing. */
export function encodeWith(res: FontResource, text: string): { hex: string, widths: number[] } | null {
  if (!res.reusable) return null
  let hex = ''
  const widths: number[] = []
  for (const ch of text) {
    const code = res.codes.get(ch) ?? (ch === ' ' ? res.codes.get(' ') : undefined)
    if (!code) return null
    hex += code
    widths.push(res.width(code))
  }
  return { hex, widths }
}

/** Characters of `text` the font cannot draw, for plain-language reporting. */
export function missingChars(res: FontResource, text: string) {
  return [...new Set([...text].filter(ch => !res.codes.has(ch) && ch !== '\n'))]
}

export type { PDFDocument }
