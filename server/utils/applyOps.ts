// Applies the client's edit list to a fresh copy of the original PDF.
import type { PDFPage } from 'mupdf'
import type { AddTextOp, Block, DocModel, EditBlockOp, EditOp, OpReport, Point, Rect, RenderReport } from '#shared/types'
import { mupdf, openPdf, takeBytes } from './mupdf'
import { describeFont, type FontResource, pageFontResources } from './pdfFonts'
import { FontBook, type FontLoader, PageWriter } from './writeText'

export interface ApplyOptions {
  loadFont: FontLoader
  /** Preview renders skip page operations; the client shows those itself. */
  includePageOps: boolean
}

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1]
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]]

function corners(r: Rect): Point[] {
  return [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]]
}

/** Shrinks a line box so redaction only catches glyphs whose centres sit on this line. */
function redactionRect(r: Rect, dir: Point): Rect {
  const horizontal = Math.abs(dir[0]) >= Math.abs(dir[1])
  const w = r[2] - r[0]
  const h = r[3] - r[1]
  return horizontal
    ? [r[0] + 0.3, r[1] + h * 0.2, r[2] - 0.3, r[3] - h * 0.2]
    : [r[0] + w * 0.2, r[1] + 0.3, r[2] - w * 0.2, r[3] - 0.3]
}

export async function applyOps(bytes: Uint8Array, ops: EditOp[], model: DocModel, options: ApplyOptions) {
  const doc = openPdf(bytes)
  const book = new FontBook(doc, options.loadFont)
  // MuPDF objects live in WebAssembly memory that the garbage collector neither sees nor
  // frees promptly, and that memory never shrinks once grown. Everything opened while
  // editing is freed as soon as the request is done.
  const opened: { destroy: () => void }[] = []
  const track = <T extends { destroy: () => void }>(obj: T) => {
    opened.push(obj)
    return obj
  }
  try {
    return await edit(doc, book, track, ops, model, options)
  }
  finally {
    for (const obj of opened.reverse()) obj.destroy()
    book.dispose()
    doc.destroy()
  }
}

async function edit(
  doc: ReturnType<typeof openPdf>,
  book: FontBook,
  track: <T extends { destroy: () => void }>(obj: T) => T,
  ops: EditOp[],
  model: DocModel,
  options: ApplyOptions,
) {
  const reports: OpReport[] = []

  // Later edits of the same block replace earlier ones.
  const editsByBlock = new Map<string, EditBlockOp>()
  const additions: AddTextOp[] = []
  for (const op of ops) {
    if (op.type === 'editBlock') editsByBlock.set(op.blockId, op)
    else if (op.type === 'addText') additions.push(op)
  }

  const pagesTouched = new Set<number>([...editsByBlock.values()].map(o => o.page).concat(additions.map(o => o.page)))
  for (const pageIndex of pagesTouched) {
    const pageModel = model.pages[pageIndex]
    if (!pageModel) continue
    const page = track(doc.loadPage(pageIndex) as PDFPage)
    const resources = pageFontResources(page)
    /** A font from anywhere in the file, with its PDF resource when it can be found. */
    const fontFor = (key: string | undefined) => {
      const info = key ? model.fonts[key] : undefined
      if (!info) return undefined
      let resource: FontResource | undefined = resources.find(r => `f${r.num}` === info.key)
      const num = /^f(\d+)$/.exec(info.key)?.[1]
      if (!resource && num) {
        try {
          resource = describeFont(doc.newIndirect(Number(num)).resolve(), Number(num))
        }
        catch {}
      }
      return { info, resource }
    }
    const edits = [...editsByBlock.values()]
      .filter(o => o.page === pageIndex)
      .map(op => ({ op, block: pageModel.blocks.find(b => b.id === op.blockId) }))
      .filter((e): e is { op: EditBlockOp, block: Block } => !!e.block?.editable)

    // 1. Remove the original glyphs of every edited block.
    if (edits.length) {
      for (const { block } of edits) {
        for (const line of block.lines) {
          const annot = track(page.createAnnotation('Redact'))
          annot.setRect(redactionRect(line.bbox, line.dir))
        }
      }
      page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE)
    }

    const writer = new PageWriter(doc, page)

    // 2. Write replacement text.
    for (const { op, block } of edits) {
      const s = op.style ?? {}
      const choice = s.font ?? 'original'
      const size = s.size ?? block.style.size
      const bold = s.bold ?? block.style.bold
      const italic = s.italic ?? block.style.italic
      const align = s.align ?? block.style.align
      const color = s.color ?? block.style.color
      const first = block.lines[0]!
      const dir = first.dir
      const v: Point = [-dir[1], dir[0]]
      const origin = first.origin
      const scale = size / block.style.size

      if (!op.text.trim()) {
        reports.push({ opId: op.id, fontUsed: '', substituted: false, bbox: block.bbox })
        continue
      }

      const fontKey = s.fontKey ?? block.style.fontKey
      const original = fontFor(fontKey)
      const font = await book.resolve({
        text: op.text,
        preferOriginal: choice === 'original',
        original,
        source: s.fontKey && s.fontKey !== block.style.fontKey ? 'file' : 'original',
        family: choice === 'original' ? (original?.info.fallback ?? block.style.family) : choice,
        bold,
        italic,
      }, resources)

      // Column extents along the writing direction, relative to the first origin.
      const along = block.lines.flatMap(l => corners(l.bbox).map(c => dot(sub(c, origin), dir)))
      const columnStart = Math.min(0, ...along)
      const columnEnd = Math.max(...along)
      const pitches = block.lines.slice(1).map((l, i) => dot(sub(l.origin, block.lines[i]!.origin), v))
      const measured = pitches.length ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 0
      // Lines closer than half the font size are not real line spacing.
      const pitch = (measured > block.style.size * 0.5 ? measured : block.style.size * 1.2) * scale
      const keepIndents = scale === 1 && align === 'left'

      const bbox = writer.draw({
        text: op.text,
        font,
        size,
        color,
        align,
        origin,
        dir,
        pitch,
        columnStart,
        columnEnd,
        wrap: block.lines.length > 1,
        lineStarts: keepIndents ? block.lines.map(l => dot(sub(l.origin, origin), dir)) : undefined,
      })
      reports.push({ opId: op.id, fontUsed: font.label, substituted: font.substituted, reason: font.reason, bbox })
    }

    // 3. New text boxes.
    for (const op of additions.filter(o => o.page === pageIndex)) {
      if (!op.text.trim()) continue
      const s = op.style
      const original = fontFor(s.fontKey)
      const font = await book.resolve({ text: op.text, preferOriginal: !!original, original, source: 'file', family: s.font, bold: s.bold, italic: s.italic }, resources)
      const bbox = writer.draw({
        text: op.text,
        font,
        size: s.size,
        color: s.color,
        align: s.align,
        origin: [op.x, op.y + s.size * 0.8],
        dir: [1, 0],
        pitch: s.size * 1.2,
        columnStart: 0,
        columnEnd: op.width,
        wrap: true,
      })
      reports.push({ opId: op.id, fontUsed: font.label, substituted: font.substituted, reason: font.reason, bbox })
    }

    writer.flush()
  }

  // 4. Page operations, always last so text ops can use original page numbers.
  if (options.includePageOps) {
    const count = doc.countPages()
    let order = Array.from({ length: count }, (_, i) => i)
    const rotation = new Map<number, number>()
    for (const op of ops) {
      if (op.type === 'deletePage') order = order.filter(i => i !== op.page)
      else if (op.type === 'reorderPages') order = op.order.filter(i => i >= 0 && i < count && order.includes(i))
      else if (op.type === 'rotatePage') rotation.set(op.page, ((rotation.get(op.page) ?? 0) + op.angle) % 360)
    }
    for (const [index, angle] of rotation) {
      if (!angle || index >= count) continue
      const obj = track(doc.loadPage(index)).getObject()
      const current = (obj.getInheritable('Rotate').valueOf() as number) || 0
      obj.put('Rotate', (((current + angle) % 360) + 360) % 360)
    }
    if (!order.length) throw new Error('A PDF needs at least one page.')
    if (order.length !== count || order.some((p, i) => p !== i)) doc.rearrangePages(order)
  }

  // Copied out of MuPDF's memory before the document is freed.
  const pdf = takeBytes(doc.saveToBuffer('garbage=compact,compress'))
  const report: RenderReport = { ops: reports }
  return { pdf, report }
}
