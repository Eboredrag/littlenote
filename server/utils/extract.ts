// Builds the editor's text model (blocks -> lines -> runs, plus per-font info)
// from MuPDF structured text.
import type { Color, Font, PDFDocument, PDFPage } from 'mupdf'
import type { Align, Block, FallbackFamily, FontInfo, Line, PageModel, Point, Rect, RGB, Run } from '#shared/types'
import { using } from './mupdf'
import { type FontResource, isSubsetName, nameKey, pageFontResources, stripSubset } from './pdfFonts'

/** `font` is the id of the MuPDF font (its pointer); the font objects themselves live in `RawPage.fonts`. */
interface RawChar { c: string, font: number, size: number, color: RGB, quad: number[], origin: Point }
interface RawLine { bbox: Rect, dir: Point, chars: RawChar[] }
interface RawBlock { bbox: Rect, lines: RawLine[] }
interface RawPage { blocks: RawBlock[], fonts: Map<number, Font> }

export interface ExtractedPage {
  model: PageModel
  /** Font resource matched for each font key used on this page. */
  resources: Map<string, FontResource>
}

export function toRGB(color: Color): RGB {
  if (color.length === 1) return [color[0], color[0], color[0]]
  if (color.length === 3) return [color[0], color[1], color[2]]
  const [c, m, y, k] = color
  return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]
}

/**
 * Reads a page's text. MuPDF hands out a new font object for every character;
 * one per font is kept (the caller frees them) and the rest are freed at once.
 */
function readPage(page: PDFPage): RawPage {
  const blocks: RawBlock[] = []
  const fonts = new Map<number, Font>()
  let block: RawBlock | null = null
  let line: RawLine | null = null
  using(page.toStructuredText('preserve-whitespace,preserve-spans'), text => text.walk({
    beginTextBlock(bbox) { block = { bbox: [...bbox] as Rect, lines: [] } },
    endTextBlock() { if (block) blocks.push(block); block = null },
    beginLine(bbox, _wmode, dir) { line = { bbox: [...bbox] as Rect, dir: [dir[0], dir[1]], chars: [] } },
    endLine() { if (block && line) block.lines.push(line); line = null },
    onChar(c, origin, font, size, quad, color) {
      const id = font.pointer
      if (fonts.has(id)) font.destroy()
      else fonts.set(id, font)
      line?.chars.push({ c, font: id, size, color: toRGB(color), quad: [...quad], origin: [origin[0], origin[1]] })
    },
  }))
  return { blocks, fonts }
}

const round = (n: number, step = 100) => Math.round(n * step) / step

function quadBox(q: number[]): Rect {
  const xs = [q[0]!, q[2]!, q[4]!, q[6]!]
  const ys = [q[1]!, q[3]!, q[5]!, q[7]!]
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return [...b] as Rect
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
}

/** "ABCDEF+TimesNewRomanPS-BoldItalicMT" -> "Times New Roman". */
export function cleanFamily(name: string) {
  let n = stripSubset(name).split(/[-,]/)[0] ?? name
  n = n.replace(/(PSMT|MT|PS)$/, '')
  n = n.replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  return n || stripSubset(name)
}

function fallbackFor(name: string, font: Font): FallbackFamily {
  const n = name.toLowerCase()
  if (/courier|mono|consol|menlo/.test(n)) return 'mono'
  if (/sans|gothic|grotesk|arial|helvetica|verdana|calibri|segoe|roboto|inter|lato|tahoma/.test(n)) return 'sans'
  if (/times|georgia|garamond|serif|roman|cambria|book|minion|palatino/.test(n)) return 'serif'
  if (font.isMono()) return 'mono'
  return font.isSerif() ? 'serif' : 'sans'
}

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/

/** Picks the page font resource most likely to be the font MuPDF drew `text` with. */
function matchResource(font: Font, text: string, resources: FontResource[]) {
  const key = nameKey(font.getName())
  let best: FontResource | undefined
  let bestScore = 0
  const chars = [...new Set(text)].filter(c => c.trim())
  for (const res of resources) {
    const rk = nameKey(res.baseFont)
    let score = rk === key ? 3 : (rk && key && (rk.includes(key) || key.includes(rk))) ? 2 : 0
    if (chars.length && res.codes.size) score += chars.filter(c => res.codes.has(c)).length / chars.length
    if (score > bestScore) [best, bestScore] = [res, score]
  }
  return bestScore >= 1 ? best : undefined
}

const dot2 = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1]

/** A gap wider than this many ems between words starts a separate text field. */
export const FIELD_GAP_EM = 0.8

/**
 * MuPDF reports separately positioned text (common in Word exports) as several
 * "lines" that share one baseline. Join neighbours that sit at normal word
 * spacing back into one field; anything further apart stays its own field.
 */
export function mergeVisualLines(lines: Line[]): Line[] {
  const out: Line[] = []
  for (const line of lines) {
    const size = line.runs[0]?.size ?? 10
    const v: Point = [-line.dir[1], line.dir[0]]
    const prev = out.at(-1)
    const prevEnd = prev ? Math.max(...[[prev.bbox[0], prev.bbox[1]], [prev.bbox[2], prev.bbox[3]]].map(c => dot2(c as Point, line.dir))) : 0
    const gap = dot2(line.origin, line.dir) - prevEnd
    const sameField = prev
      && prev.dir[0] === line.dir[0] && prev.dir[1] === line.dir[1]
      && Math.abs(dot2(prev.origin, v) - dot2(line.origin, v)) < size * 0.35
      && gap > -size * 0.2
      && gap <= size * FIELD_GAP_EM
    if (!prev || !sameField) {
      out.push({ ...line, runs: [...line.runs] })
      continue
    }
    // Insert a space when the gap between segments is wider than letter spacing.
    if (gap > size * 0.15 && !/\s$/.test(prev.text) && !/^\s/.test(line.text)) {
      const last = prev.runs.at(-1)!
      prev.runs.push({ ...last, text: ' ', bbox: [...last.bbox] as Rect })
    }
    prev.runs.push(...line.runs)
    prev.text = prev.runs.map(r => r.text).join('')
    prev.bbox = unionRect(prev.bbox, line.bbox)
  }
  // Neighbouring runs with identical style become one run again.
  for (const l of out) {
    const merged: Run[] = []
    for (const r of l.runs) {
      const m = merged.at(-1)
      if (m && m.fontKey === r.fontKey && m.size === r.size && m.color.join() === r.color.join()) {
        m.text += r.text
        m.bbox = unionRect(m.bbox, r.bbox)
      }
      else merged.push({ ...r })
    }
    l.runs = merged
  }
  return out
}

/** Splits one MuPDF line into segments wherever words are further apart than FIELD_GAP_EM. */
function splitAtGaps(rl: RawLine): RawChar[][] {
  const segments: RawChar[][] = []
  let current: RawChar[] = []
  let pendingSpace: RawChar[] = []
  let lastEnd = 0
  const along = (ch: RawChar) => {
    const box = quadBox(ch.quad)
    const a = dot2([box[0], box[1]], rl.dir)
    const b = dot2([box[2], box[3]], rl.dir)
    return [Math.min(a, b), Math.max(a, b)] as const
  }
  for (const ch of rl.chars) {
    if (!ch.c.trim()) {
      if (current.length) pendingSpace.push(ch)
      continue
    }
    const [startAt, endAt] = along(ch)
    if (current.length && startAt - lastEnd > ch.size * FIELD_GAP_EM) {
      segments.push(current)
      current = []
    }
    else if (current.length) current.push(...pendingSpace)
    pendingSpace = []
    current.push(ch)
    lastEnd = endAt
  }
  if (current.length) segments.push(current)
  return segments
}

function inferAlign(lines: Line[]): Align {
  if (lines.length < 2 || lines.some(l => l.dir[1] !== 0)) return 'left'
  const near = (vals: number[]) => Math.max(...vals) - Math.min(...vals) < 1.5
  if (near(lines.map(l => l.bbox[0]))) return 'left'
  if (near(lines.map(l => l.bbox[2]))) return 'right'
  if (near(lines.map(l => (l.bbox[0] + l.bbox[2]) / 2))) return 'center'
  return 'left'
}

/**
 * Extracts one page. `fonts` is the document-wide font table and is filled in
 * as new fonts are seen.
 */
export function extractPage(page: PDFPage, index: number, fonts: Record<string, FontInfo>): ExtractedPage {
  const read = readPage(page)
  try {
    return buildPage(page, index, fonts, read)
  }
  finally {
    for (const font of read.fonts.values()) font.destroy()
  }
}

function buildPage(page: PDFPage, index: number, fonts: Record<string, FontInfo>, read: RawPage): ExtractedPage {
  const raw = read.blocks
  const resources = pageFontResources(page)
  const [x0, y0, x1, y1] = page.getBounds()
  const rotation = ((page.getObject().getInheritable('Rotate').valueOf() as number) || 0) % 360
  const hasPendingRedactions = page.getAnnotations().some(a => a.getType() === 'Redact')

  // Text drawn by each runtime font object, for resource matching.
  const textByFont = new Map<number, { font: Font, text: string }>()
  for (const b of raw) for (const l of b.lines) for (const ch of l.chars) {
    const entry = textByFont.get(ch.font) ?? { font: read.fonts.get(ch.font)!, text: '' }
    entry.text += ch.c
    textByFont.set(ch.font, entry)
  }

  const keyByPointer = new Map<number, string>()
  const pageResources = new Map<string, FontResource>()
  for (const [pointer, { font, text }] of textByFont) {
    const res = matchResource(font, text, resources)
    const rawName = res?.baseFont ?? font.getName()
    const key = res && res.num >= 0 ? `f${res.num}` : `n-${nameKey(rawName)}-${font.isBold() ? 'b' : ''}${font.isItalic() ? 'i' : ''}`
    keyByPointer.set(pointer, key)
    if (res) pageResources.set(key, res)
    if (!fonts[key]) {
      const styleName = `${rawName} ${font.getName()}`
      fonts[key] = {
        key,
        rawName,
        family: cleanFamily(rawName),
        bold: font.isBold() || /bold|black|heavy|semibold|demi/i.test(styleName),
        italic: font.isItalic() || /italic|oblique/i.test(styleName),
        serif: font.isSerif(),
        mono: font.isMono(),
        embedded: res?.embedded ?? false,
        subset: isSubsetName(rawName),
        type: res?.subtype ?? 'Unknown',
        program: res?.program,
        fallback: fallbackFor(rawName, font),
      }
    }
  }

  // Every visual line becomes its own text field; wide gaps split a line into several fields.
  const blocks: Block[] = []
  for (const rb of raw) {
    const segments: Line[] = []
    for (const rl of rb.lines) {
      for (const chars of splitAtGaps(rl)) {
        const runs: Run[] = []
        let current: Run | null = null
        let bbox: Rect | null = null
        for (const ch of chars) {
          const fontKey = keyByPointer.get(ch.font)!
          const size = round(ch.size)
          const color = ch.color.map(v => round(v, 1000)) as RGB
          const box = quadBox(ch.quad)
          bbox = unionRect(bbox, box)
          if (current && current.fontKey === fontKey && current.size === size && current.color.join() === color.join()) {
            current.text += ch.c
            current.bbox = unionRect(current.bbox, box)
          }
          else {
            current = { text: ch.c, fontKey, size, color, bbox: box }
            runs.push(current)
          }
        }
        segments.push({
          bbox: bbox!.map(v => round(v)) as Rect,
          origin: chars[0]!.origin.map(v => round(v)) as Point,
          dir: rl.dir.map(v => round(v, 1000)) as Point,
          runs,
          text: runs.map(r => r.text).join(''),
        })
      }
    }

    for (const line of mergeVisualLines(segments)) {
      const lines = [line]
      // Dominant style = the run covering the most characters.
      const weight = new Map<string, { run: Run, n: number }>()
      for (const r of line.runs) {
        const k = `${r.fontKey}|${r.size}|${r.color.join()}`
        const e = weight.get(k) ?? { run: r, n: 0 }
        e.n += r.text.trim().length
        weight.set(k, e)
      }
      const dominant = [...weight.values()].sort((a, b) => b.n - a.n)[0]!.run
      const info = fonts[dominant.fontKey]!

      const axisAligned = Math.abs(line.dir[0]) === 1 || Math.abs(line.dir[1]) === 1
      const usesType3 = line.runs.some(r => fonts[r.fontKey]?.type === 'Type3')
      let readOnlyReason: string | undefined
      if (hasPendingRedactions) readOnlyReason = 'This page has unapplied redactions, so its text is kept as it is.'
      else if (usesType3) readOnlyReason = 'This text is drawn with a Type3 font, which can’t be edited.'
      else if (!axisAligned) readOnlyReason = 'Angled text can’t be edited yet.'
      else if (RTL.test(line.text)) readOnlyReason = 'Right-to-left text can’t be edited yet.'

      blocks.push({
        id: `p${index}-b${blocks.length}`,
        bbox: line.bbox,
        lines,
        text: line.text.trim(),
        style: {
          fontKey: dominant.fontKey,
          family: info.fallback,
          size: dominant.size,
          color: dominant.color,
          bold: info.bold,
          italic: info.italic,
          align: inferAlign(lines),
        },
        editable: !readOnlyReason,
        readOnlyReason,
        mixed: weight.size > 1,
      })
    }
  }

  return {
    model: { index, width: round(x1 - x0), height: round(y1 - y0), rotation, blocks },
    resources: pageResources,
  }
}

export function extractDocument(doc: PDFDocument) {
  const fonts: Record<string, FontInfo> = {}
  const pages: PageModel[] = []
  const count = doc.countPages()
  // Each page is freed as soon as it has been read.
  for (let i = 0; i < count; i++) pages.push(using(doc.loadPage(i), page => extractPage(page, i, fonts).model))
  return { pages, fonts }
}
