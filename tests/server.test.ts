import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DocModel, EditOp } from '#shared/types'
import { applyOps } from '../server/utils/applyOps'
import { buildModel } from '../server/utils/model'
import { openPdf } from '../server/utils/mupdf'

const fixture = (name: string) => readFile(join(__dirname, 'fixtures', name)).then(b => new Uint8Array(b))
const loadFont = (file: string) => readFile(join(__dirname, '..', 'public', 'fonts', file)).then(b => new Uint8Array(b))
const model = (bytes: Uint8Array) => buildModel(bytes, { id: 'test', name: 'test.pdf', expiresAt: 0 })

function textOf(pdf: Uint8Array, page = 0) {
  return openPdf(pdf).loadPage(page).toStructuredText('preserve-whitespace').asText()
}

function blockWith(m: DocModel, text: string) {
  for (const p of m.pages) for (const b of p.blocks) if (b.text.includes(text)) return b
  throw new Error(`no block containing ${text}`)
}

async function edit(file: string, find: string, text: string, style?: Extract<EditOp, { type: 'editBlock' }>['style']) {
  const bytes = await fixture(file)
  const m = model(bytes)
  const block = blockWith(m, find)
  const op: EditOp = { id: 'op1', type: 'editBlock', page: Number(block.id.split('-')[0]!.slice(1)), blockId: block.id, text, style }
  const out = await applyOps(bytes, [op], m, { loadFont, includePageOps: true })
  return { ...out, model: m, block, after: model(out.pdf) }
}

describe('extraction', () => {
  it('reports standard fonts, sizes and colours', async () => {
    const m = model(await fixture('helvetica.pdf'))
    const title = blockWith(m, 'Hello World')
    expect(title.style.size).toBe(24)
    expect(m.fonts[title.style.fontKey!]).toMatchObject({ family: 'Helvetica', bold: true, embedded: false, type: 'Type1' })
    expect(blockWith(m, 'Thank you').style.color).toEqual([0.8, 0, 0])
  })

  it('reports embedded subset fonts', async () => {
    const m = model(await fixture('cv.pdf'))
    const name = m.fonts[blockWith(m, 'Alex Example').style.fontKey!]!
    expect(name).toMatchObject({ embedded: true, program: 'TrueType', bold: true, fallback: 'sans' })
    expect(m.fonts[blockWith(m, 'Product designer').style.fontKey!]).toMatchObject({ italic: true, fallback: 'serif' })
  })
})

describe('editing', () => {
  it('truly replaces text and keeps neighbours', async () => {
    const { pdf, report } = await edit('helvetica.pdf', 'Hello World', 'Goodbye World')
    const text = textOf(pdf)
    expect(text).toContain('Goodbye World')
    expect(text).not.toContain('Hello')
    expect(text).toContain('Invoice number 1234')
    expect(text).toContain('Thank you for your business.')
    expect(report.ops[0]).toMatchObject({ substituted: false })
  })

  it('places the new text where the old text was', async () => {
    const { after, block } = await edit('helvetica.pdf', 'Hello World', 'Goodbye World')
    const replaced = blockWith(after, 'Goodbye')
    expect(Math.abs(replaced.lines[0]!.origin[0] - block.lines[0]!.origin[0])).toBeLessThan(1)
    expect(Math.abs(replaced.lines[0]!.origin[1] - block.lines[0]!.origin[1])).toBeLessThan(1)
    expect(replaced.style.size).toBe(24)
    expect(after.fonts[replaced.style.fontKey!]!.family).toBe('Helvetica')
    expect(after.fonts[replaced.style.fontKey!]!.bold).toBe(true)
  })

  it('reuses the original subset font when every letter exists in it', async () => {
    const { report, after } = await edit('subset.pdf', 'Hello from', 'Hello from a font')
    expect(report.ops[0]).toMatchObject({ substituted: false, fontUsed: 'Liberation Serif (original)' })
    expect(textOf((await edit('subset.pdf', 'Hello from', 'Hello from a font')).pdf)).toContain('Hello from a font')
    expect(after.pages[0]!.blocks).toHaveLength(2)
  })

  it('falls back and says why when a letter is missing from a subset', async () => {
    const { report, pdf } = await edit('subset.pdf', 'Hello from', 'Quick zebra')
    expect(report.ops[0]!.substituted).toBe(true)
    expect(report.ops[0]!.reason).toMatch(/doesn’t include “Q”/)
    expect(textOf(pdf)).toContain('Quick zebra')
    expect(textOf(pdf)).not.toContain('Hello from')
  })

  it('keeps colour on a coloured background without painting over it', async () => {
    const { pdf, after } = await edit('colored.pdf', 'Page 1', 'First page on blue')
    expect(textOf(pdf)).toContain('First page on blue')
    expect(blockWith(after, 'First page').style.color).toEqual([0, 0.2, 0.6])
  })

  it('writes in the right place on rotated pages', async () => {
    const { after, block, pdf } = await edit('rotated.pdf', 'Rotated', 'Turned page text')
    expect(textOf(pdf)).toContain('Turned page text')
    const replaced = blockWith(after, 'Turned')
    expect(replaced.lines[0]!.dir).toEqual(block.lines[0]!.dir)
    expect(Math.abs(replaced.lines[0]!.origin[0] - block.lines[0]!.origin[0])).toBeLessThan(1)
    expect(Math.abs(replaced.lines[0]!.origin[1] - block.lines[0]!.origin[1])).toBeLessThan(1)
  })

  it('writes in the right place with an offset media box', async () => {
    const { after, block } = await edit('offset.pdf', 'Offset', 'Shifted media box')
    const replaced = blockWith(after, 'Shifted')
    expect(Math.abs(replaced.lines[0]!.origin[0] - block.lines[0]!.origin[0])).toBeLessThan(1)
    expect(Math.abs(replaced.lines[0]!.origin[1] - block.lines[0]!.origin[1])).toBeLessThan(1)
  })

  it('deletes a whole field and keeps its neighbours', async () => {
    const { pdf, report, block } = await edit('words.pdf', 'Total due', '')
    const text = textOf(pdf)
    expect(text).not.toContain('Total due')
    expect(text).toContain('1,250.00')
    expect(text).toContain('Please send the signed contract by Friday')
    expect(report.ops[0]).toMatchObject({ fontUsed: '', substituted: false, bbox: block.bbox })
  })

  it('restyles with a bundled font, size and colour', async () => {
    const { after, report } = await edit('helvetica.pdf', 'Invoice', 'Invoice number 5678', { font: 'serif', size: 16, color: [0, 0.5, 0], bold: true })
    const b = blockWith(after, '5678')
    expect(b.style.size).toBe(16)
    b.style.color.forEach((c, i) => expect(c).toBeCloseTo([0, 0.5, 0][i]!, 2))
    expect(after.fonts[b.style.fontKey!]!.family).toMatch(/Liberation ?Serif/)
    expect(report.ops[0]!.fontUsed).toBe('Liberation Serif Bold')
  })

  it('adds a new text box', async () => {
    const bytes = await fixture('helvetica.pdf')
    const m = model(bytes)
    const { pdf } = await applyOps(bytes, [{ id: 'a', type: 'addText', page: 0, x: 72, y: 400, width: 300, text: 'Added note', style: { font: 'sans', size: 14, color: [0, 0, 0], bold: false, italic: false, align: 'left' } }], m, { loadFont, includePageOps: true })
    const b = blockWith(model(pdf), 'Added note')
    expect(Math.abs(b.bbox[0] - 72)).toBeLessThan(1)
  })
})

describe('fonts from the file', () => {
  it('draws a new text box in a font from the file', async () => {
    const bytes = await fixture('cv.pdf')
    const m = model(bytes)
    const title = blockWith(m, 'Alex Example')
    const style = { font: 'sans' as const, fontKey: title.style.fontKey, size: 20, color: [0, 0, 0] as [number, number, number], bold: true, italic: false, align: 'left' as const }
    const { pdf, report } = await applyOps(bytes, [{ id: 'a', type: 'addText', page: 0, x: 56, y: 400, width: 300, text: 'Example', style }], m, { loadFont, includePageOps: true })
    expect(report.ops[0]).toMatchObject({ substituted: false, fontUsed: 'Liberation Sans (from this file)' })
    const added = blockWith(model(pdf), 'Example')
    expect(added.style.fontKey).toBeDefined()
  })

  it('falls back and says why when the file font lacks a letter', async () => {
    const bytes = await fixture('cv.pdf')
    const m = model(bytes)
    const title = blockWith(m, 'Alex Example')
    const style = { font: 'sans' as const, fontKey: title.style.fontKey, size: 20, color: [0, 0, 0] as [number, number, number], bold: true, italic: false, align: 'left' as const }
    const { report } = await applyOps(bytes, [{ id: 'a', type: 'addText', page: 0, x: 56, y: 400, width: 300, text: 'Zebra', style }], m, { loadFont, includePageOps: true })
    expect(report.ops[0]!.substituted).toBe(true)
    expect(report.ops[0]!.reason).toMatch(/doesn’t include “Z”/)
  })

  it('restyles existing text into another font from the file', async () => {
    const bytes = await fixture('helvetica.pdf')
    const m = model(bytes)
    const title = blockWith(m, 'Hello World')
    const { report, after } = await edit('helvetica.pdf', 'Invoice', 'Invoice number 1234', { font: 'original', fontKey: title.style.fontKey, bold: true })
    expect(report.ops[0]!.fontUsed).toBe('Helvetica (from this file)')
    expect(after.fonts[blockWith(after, 'Invoice').style.fontKey!]!.bold).toBe(true)
  })
})

describe('word-by-word PDFs', () => {
  it('reads separately placed words as one line', async () => {
    const m = model(await fixture('words.pdf'))
    const b = blockWith(m, 'Please')
    expect(b.lines).toHaveLength(1)
    expect(b.text).toBe('Please send the signed contract by Friday')
  })

  it('splits a line at wide gaps into separate fields', async () => {
    const m = model(await fixture('words.pdf'))
    const texts = m.pages[0]!.blocks.map(b => b.text)
    expect(texts).toContain('Total due')
    expect(texts).toContain('1,250.00')
    expect(texts).toContain('Name:')
    expect(texts).toContain('Alex')
  })

  it('gives every line of a paragraph its own field', async () => {
    const m = model(await fixture('cv.pdf'))
    const texts = m.pages[0]!.blocks.map(b => b.text)
    expect(texts).toContain('Senior designer at Example Studio, 2021 to present.')
    expect(texts).toContain('Led the redesign of the booking flow and the design system.')
    expect(m.pages[0]!.blocks.every(b => b.lines.length === 1)).toBe(true)
  })

  it('keeps an edited line on one baseline', async () => {
    const { after, block, pdf } = await edit('words.pdf', 'Please', 'Please send the signed contract by Monday')
    expect(textOf(pdf)).toContain('Please send the signed contract by Monday')
    const replaced = blockWith(after, 'Monday')
    expect(replaced.lines).toHaveLength(1)
    expect(Math.abs(replaced.lines[0]!.origin[1] - block.lines[0]!.origin[1])).toBeLessThan(1)
    expect(blockWith(after, 'Questions').text).toBe('Questions go to the office manager')
  })
})

describe('page operations', () => {
  it('deletes, reorders and rotates', async () => {
    const bytes = await fixture('colored.pdf')
    const m = model(bytes)
    const ops: EditOp[] = [
      { id: '1', type: 'deletePage', page: 1 },
      { id: '2', type: 'reorderPages', order: [2, 0] },
      { id: '3', type: 'rotatePage', page: 2, angle: 90 },
    ]
    const { pdf } = await applyOps(bytes, ops, m, { loadFont, includePageOps: true })
    const doc = openPdf(pdf)
    expect(doc.countPages()).toBe(2)
    expect(textOf(pdf, 0)).toContain('Page 3')
    expect(textOf(pdf, 1)).toContain('Page 1')
    expect(doc.loadPage(0).getObject().getInheritable('Rotate').valueOf()).toBe(90)
  })
})
