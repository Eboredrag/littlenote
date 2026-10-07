// Chooses a font for new text and writes it into a page's content stream.
import type { Font, Matrix, PDFDocument, PDFObject, PDFPage } from 'mupdf'
import type { Align, FallbackFamily, FontInfo, Point, Rect, RGB } from '#shared/types'
import { mupdf, using } from './mupdf'
import { at, builtinFont, canonicalBase14, encodeWith, type FontResource, isBase14Name, missingChars, nameKey, stripSubset } from './pdfFonts'

export type FontLoader = (file: string) => Promise<Uint8Array>

const FALLBACK_NAMES: Record<FallbackFamily, string> = {
  sans: 'Liberation Sans',
  serif: 'Liberation Serif',
  mono: 'Liberation Mono',
}

export function fallbackFile(family: FallbackFamily, bold: boolean, italic: boolean) {
  const base = { sans: 'LiberationSans', serif: 'LiberationSerif', mono: 'LiberationMono' }[family]
  const style = bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular'
  return `${base}-${style}.ttf`
}

export interface FontRequest {
  text: string
  /** Use the block's original font when possible. */
  preferOriginal: boolean
  original?: { info: FontInfo, resource?: FontResource }
  /** How to name the original font in reports: the block's own font, or another font from the file. */
  source?: 'original' | 'file'
  family: FallbackFamily
  bold: boolean
  italic: boolean
}

/** A font ready to draw with: encodes text and reports widths in 1/1000 em. */
export interface ResolvedFont {
  ref: PDFObject
  label: string
  substituted: boolean
  reason?: string
  encode: (text: string) => { hex: string, widths: number[] }
}

const describeChars = (chars: string[]) => {
  const shown = chars.slice(0, 3).map(c => (c === ' ' ? 'a space' : `“${c}”`))
  if (chars.length > 3) return `${shown.join(', ')} and ${chars.length - 3} more letters`
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} or ${shown.at(-1)}` : shown[0]!
}

/** Per-output-document cache, so each font program is embedded once. */
export class FontBook {
  /** `owned` fonts were created for this document and are freed by `dispose()`; cached built-ins are not. */
  private embedded = new Map<string, { font: Font, ref: PDFObject, owned: boolean }>()
  constructor(private doc: PDFDocument, private loadFont: FontLoader) {}

  private embed(key: string, make: () => Font, owned: boolean) {
    let e = this.embedded.get(key)
    if (!e) {
      const font = make()
      e = { font, ref: this.doc.addFont(font), owned }
      this.embedded.set(key, e)
    }
    return e
  }

  /** Frees the fonts this book created. */
  dispose() {
    for (const e of this.embedded.values()) if (e.owned) e.font.destroy()
    this.embedded.clear()
  }

  private viaProgram(key: string, label: string, make: () => Font, extra: Partial<ResolvedFont> = {}, owned = true): ResolvedFont {
    const { font, ref } = this.embed(key, make, owned)
    return {
      ref,
      label,
      substituted: true,
      ...extra,
      encode(text) {
        let hex = ''
        const widths: number[] = []
        for (const ch of text) {
          const gid = font.encodeCharacter(ch)
          hex += gid.toString(16).padStart(4, '0')
          widths.push(font.advanceGlyph(gid) * 1000)
        }
        return { hex, widths }
      },
    }
  }

  async resolve(req: FontRequest, pageResources: FontResource[]): Promise<ResolvedFont> {
    const text = req.text.replace(/\n/g, '')
    const orig = req.original
    let reason: string | undefined

    if (req.preferOriginal && orig) {
      const sameStyle = orig.info.bold === req.bold && orig.info.italic === req.italic
      // 1. The original font object, or a sibling of the same family in the requested style.
      const candidates: FontResource[] = []
      if (sameStyle && orig.resource) candidates.push(orig.resource)
      if (!sameStyle) {
        const fam = nameKey(orig.info.family)
        for (const r of pageResources) {
          const n = stripSubset(r.baseFont)
          const b = /bold|black|heavy|semibold|demi/i.test(n)
          const i = /italic|oblique/i.test(n)
          if (nameKey(n).startsWith(fam) && b === req.bold && i === req.italic) candidates.push(r)
        }
      }
      for (const res of candidates) {
        if (encodeWith(res, text)) {
          const ref = res.num >= 0 ? this.doc.newIndirect(res.num) : res.obj
          return {
            ref,
            label: `${orig.info.family} (${req.source === 'file' ? 'from this file' : 'original'})`,
            substituted: false,
            encode: t => encodeWith(res, t)!,
          }
        }
      }
      if (orig.resource && sameStyle) {
        const missing = missingChars(orig.resource, text)
        reason = missing.length
          ? `${orig.info.family} in this file doesn’t include ${describeChars(missing)}`
          : `${orig.info.family} in this file can’t be reused`
      }
      else if (!sameStyle) {
        reason = `This file has no ${req.bold ? 'bold ' : ''}${req.italic ? 'italic ' : ''}${!req.bold && !req.italic ? 'regular ' : ''}${orig.info.family}`
      }
      else {
        reason = `${orig.info.family} couldn’t be found in the file`
      }

      // 2. A standard PDF font with the same name (Helvetica, Times, Courier and aliases).
      if (isBase14Name(orig.info.rawName) && orig.info.fallback !== undefined) {
        const styled = canonicalBase14(`${stripSubset(orig.info.rawName).split(/[-,]/)[0]}${req.bold ? '-Bold' : ''}${req.italic ? '-Italic' : ''}`)
        // Built-in fonts come from a process-wide cache, so the book must not free them.
        const builtin = builtinFont(styled)
        if ([...text].every(ch => builtin.encodeCharacter(ch) !== 0 || ch === ' ')) {
          const isSameFont = !orig.info.embedded && sameStyle
          return this.viaProgram(`base14:${styled}`, isSameFont ? `${orig.info.family}` : styled.replace(/-/g, ' '), () => builtin, {
            substituted: !isSameFont,
            reason: isSameFont ? undefined : `${reason}, so we used the standard ${styled.replace(/-/g, ' ')}`,
          }, false)
        }
      }

      // 3. The embedded program itself, when it carries a usable character map.
      const programKey = `program:${orig.resource?.num}`
      const program = orig.resource && sameStyle ? (this.embedded.get(programKey)?.font ?? embeddedProgram(orig.resource)) : null
      if (program && [...text].every(ch => ch === ' ' || program.encodeCharacter(ch) !== 0)) {
        return this.viaProgram(programKey, `${orig.info.family} (${req.source === 'file' ? 'from this file' : 'original'})`, () => program, { substituted: false })
      }
      if (program && !this.embedded.has(programKey)) program.destroy()
    }

    // 4. Bundled fallback.
    const file = fallbackFile(req.family, req.bold, req.italic)
    const bytes = await this.loadFont(file)
    const label = `${FALLBACK_NAMES[req.family]}${req.bold ? ' Bold' : ''}${req.italic ? ' Italic' : ''}`
    const fallbackKey = `fallback:${file}`
    return this.viaProgram(fallbackKey, label, () => new mupdf.Font(label, bytes), {
      substituted: !!(req.preferOriginal && orig),
      reason: req.preferOriginal && orig
        ? `${reason ?? `${orig.info.family} isn’t available`}, so we used ${nameKey(orig.info.family) === nameKey(FALLBACK_NAMES[req.family]) ? `the complete ${FALLBACK_NAMES[req.family]} font` : FALLBACK_NAMES[req.family]}`
        : undefined,
    })
  }
}

function embeddedProgram(res: FontResource): Font | null {
  if (res.program !== 'TrueType' && res.program !== 'OpenType') return null
  const owner = res.subtype === 'Type0' ? at(res.obj, 'DescendantFonts', 0) : res.obj
  const stream = at(owner, 'FontDescriptor', res.program === 'TrueType' ? 'FontFile2' : 'FontFile3')
  if (!stream) return null
  try {
    // The font keeps its own copy of the data, so the stream buffer can be freed straight away.
    return using(stream.readStream(), data => new mupdf.Font(stripSubset(res.baseFont), data))
  }
  catch {
    return null
  }
}

// --- Layout -------------------------------------------------------------------

export interface LayoutInput {
  text: string
  font: ResolvedFont
  size: number
  color: RGB
  align: Align
  /** Baseline origin of the first line, display space. */
  origin: Point
  /** Writing direction, display space. */
  dir: Point
  /** Distance between baselines. */
  pitch: number
  /** Start/end of the text column along `dir`, relative to `origin`. */
  columnStart: number
  columnEnd: number
  /** Wrap long lines to the column width. */
  wrap: boolean
  /** Optional per-line starting offsets (keeps original indents). */
  lineStarts?: number[]
}

interface LaidLine { hex: string, start: number, width: number }

function wrapLine(words: string[], font: ResolvedFont, size: number, maxWidth: number) {
  const measure = (s: string) => font.encode(s).widths.reduce((a, b) => a + b, 0) * size / 1000
  const out: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && measure(candidate) > maxWidth) {
      out.push(line)
      line = word
    }
    else line = candidate
  }
  out.push(line)
  return out
}

export function layout(input: LayoutInput) {
  const { font, size } = input
  const column = input.columnEnd - input.columnStart
  const lines: LaidLine[] = []
  const paragraphs = input.text.split('\n')
  const rows = paragraphs.flatMap(p => (input.wrap ? wrapLine(p.split(' '), font, size, column) : [p]))
  rows.forEach((row, i) => {
    const { hex, widths } = font.encode(row)
    const width = widths.reduce((a, b) => a + b, 0) * size / 1000
    let start = input.lineStarts?.[i] ?? input.columnStart
    if (input.align === 'center') start = input.columnStart + (column - width) / 2
    else if (input.align === 'right') start = input.columnEnd - width
    lines.push({ hex, start, width })
  })
  return lines
}

// --- Writing into the page ---------------------------------------------------

const fmt = (n: number) => (Math.abs(n) < 1e-6 ? '0' : Number(n.toFixed(4)).toString())

function apply(m: Matrix, p: Point): Point {
  return [p[0] * m[0] + p[1] * m[2] + m[4], p[0] * m[1] + p[1] * m[3] + m[5]]
}

/** Page-level helper that collects drawing commands and flushes them once. */
export class PageWriter {
  private ops: string[] = []
  private names = new Map<number | PDFObject, string>()
  private fontDict: PDFObject
  private inverse: Matrix

  constructor(private doc: PDFDocument, private page: PDFPage) {
    const pageObj = page.getObject()
    let resources = pageObj.get('Resources')
    if (resources.isNull()) {
      // Inherited resources: give the page its own copy before adding to it.
      const inherited = pageObj.getInheritable('Resources')
      resources = doc.newDictionary()
      if (!inherited.isNull()) inherited.forEach((v, k) => resources.put(k, v))
      pageObj.put('Resources', resources)
    }
    let fonts = resources.get('Font')
    if (!fonts.isDictionary()) {
      fonts = doc.newDictionary()
      resources.put('Font', fonts)
    }
    this.fontDict = fonts
    this.inverse = mupdf.Matrix.invert(page.getTransform())
  }

  private nameFor(ref: PDFObject) {
    const key = ref.isIndirect() ? ref.asIndirect() : ref
    let name = this.names.get(key)
    if (!name) {
      let n = 0
      while (!this.fontDict.get(`FEd${n}`).isNull()) n++
      name = `FEd${n}`
      this.fontDict.put(name, ref)
      this.names.set(key, name)
    }
    return name
  }

  /** Draws laid-out lines and returns their display-space bounding box. */
  draw(input: LayoutInput): Rect {
    const lines = layout(input)
    const name = this.nameFor(input.font.ref)
    const [dx, dy] = input.dir
    const v: Point = [-dy, dx] // next-line direction in display space
    // Text axes in user space.
    const ux = apply(this.inverse, [dx, dy])
    const u0 = apply(this.inverse, [0, 0])
    let ax = ux[0] - u0[0]
    let ay = ux[1] - u0[1]
    const len = Math.hypot(ax, ay) || 1
    ax /= len
    ay /= len

    const [r, g, b] = input.color
    let box: Rect | null = null
    const extend = (p: Point) => {
      box = box ? [Math.min(box[0], p[0]), Math.min(box[1], p[1]), Math.max(box[2], p[0]), Math.max(box[3], p[1])] : [p[0], p[1], p[0], p[1]]
    }

    lines.forEach((line, i) => {
      const along = line.start
      const down = i * input.pitch
      const o: Point = [input.origin[0] + dx * along + v[0] * down, input.origin[1] + dy * along + v[1] * down]
      const [px, py] = apply(this.inverse, o)
      if (line.hex) {
        this.ops.push(`BT /${name} ${fmt(input.size)} Tf ${fmt(r)} ${fmt(g)} ${fmt(b)} rg ${fmt(ax)} ${fmt(ay)} ${fmt(-ay)} ${fmt(ax)} ${fmt(px)} ${fmt(py)} Tm <${line.hex}> Tj ET`)
      }
      const asc = input.size * 0.8
      const desc = input.size * 0.22
      for (const [a, d] of [[0, -asc], [line.width, -asc], [0, desc], [line.width, desc]] as const) {
        extend([o[0] + dx * a + v[0] * d, o[1] + dy * a + v[1] * d])
      }
    })
    return box ?? [input.origin[0], input.origin[1], input.origin[0], input.origin[1]]
  }

  /** Appends the collected text, isolated from any unbalanced state in the original content. */
  flush() {
    if (!this.ops.length) return
    const pageObj = this.page.getObject()
    const contents = pageObj.get('Contents')
    const array = this.doc.newArray()
    array.push(this.doc.addStream('q\n', {}))
    if (contents.isArray()) contents.forEach(c => array.push(c))
    else if (!contents.isNull()) array.push(contents)
    array.push(this.doc.addStream(`\nQ\nq\n${this.ops.join('\n')}\nQ\n`, {}))
    pageObj.put('Contents', array)
    this.ops = []
  }
}
