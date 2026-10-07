// Generates the PDF fixtures used by the server tests.
// Run with `npm run fixtures`. Output: tests/fixtures/*.pdf
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'tests', 'fixtures')
const font = name => readFile(join(root, 'public', 'fonts', name))

async function save(doc, name) {
  await writeFile(join(out, name), await doc.save({ useObjectStreams: false }))
  console.log('wrote', name)
}

async function helvetica() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  page.drawText('Hello World', { x: 72, y: 700, size: 24, font: bold })
  page.drawText('Invoice number 1234', { x: 72, y: 600, size: 12, font: regular })
  page.drawText('Thank you for your business.', { x: 72, y: 500, size: 12, font: regular, color: rgb(0.8, 0, 0) })
  await save(doc, 'helvetica.pdf')
}

async function subset() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const serif = await doc.embedFont(await font('LiberationSerif-Regular.ttf'), { subset: true })
  const page = doc.addPage([612, 792])
  page.drawText('Hello from a subset font', { x: 72, y: 700, size: 18, font: serif })
  page.drawText('Another line stays put', { x: 72, y: 600, size: 18, font: serif })
  await save(doc, 'subset.pdf')
}

async function rotated() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  page.setRotation(degrees(90))
  const regular = await doc.embedFont(StandardFonts.TimesRoman)
  page.drawText('Rotated page text', { x: 72, y: 700, size: 20, font: regular })
  await save(doc, 'rotated.pdf')
}

async function offset() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  page.setMediaBox(100, 100, 612, 792)
  const regular = await doc.embedFont(StandardFonts.Courier)
  page.drawText('Offset media box', { x: 172, y: 700, size: 16, font: regular })
  await save(doc, 'offset.pdf')
}

async function colored() {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([612, 792])
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.85, 0.93, 1) })
    page.drawText(`Page ${i} on blue`, { x: 72, y: 700, size: 20, font: regular, color: rgb(0, 0.2, 0.6) })
  }
  await save(doc, 'colored.pdf')
}

// A CV-like document mixing several fonts and sizes, standing in for a real-world file.
async function cv() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const sansBold = await doc.embedFont(await font('LiberationSans-Bold.ttf'), { subset: true })
  const sans = await doc.embedFont(await font('LiberationSans-Regular.ttf'), { subset: true })
  const serifItalic = await doc.embedFont(await font('LiberationSerif-Italic.ttf'), { subset: true })
  const page = doc.addPage([595, 842])
  page.drawText('Alex Example', { x: 56, y: 770, size: 28, font: sansBold })
  page.drawText('Product designer, Lisbon', { x: 56, y: 744, size: 13, font: serifItalic, color: rgb(0.35, 0.35, 0.35) })
  page.drawText('Experience', { x: 56, y: 690, size: 15, font: sansBold })
  const lines = [
    'Senior designer at Example Studio, 2021 to present.',
    'Led the redesign of the booking flow and the design system.',
    'Designer at Sample Agency, 2017 to 2021.',
  ]
  lines.forEach((t, i) => page.drawText(t, { x: 56, y: 664 - i * 18, size: 11, font: sans }))
  await save(doc, 'cv.pdf')
}

// Word-style output: every word is positioned on its own, so MuPDF may report
// one visual line as several lines sharing a baseline.
async function words() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const place = (text, y, size = 12) => {
    let x = 72
    for (const w of text.split(' ')) {
      page.drawText(w, { x, y, size, font: regular })
      x += regular.widthOfTextAtSize(`${w} `, size) + 2.5
    }
  }
  place('Please send the signed contract by Friday', 700)
  place('Questions go to the office manager', 680)
  // A label and a value far apart on one line: two separate fields.
  page.drawText('Total due', { x: 72, y: 640, size: 12, font: regular })
  page.drawText('1,250.00', { x: 400, y: 640, size: 12, font: regular })
  page.drawText('Name:                         Alex', { x: 72, y: 620, size: 12, font: regular })
  await save(doc, 'words.pdf')
}

await mkdir(out, { recursive: true })
await Promise.all([helvetica(), subset(), rotated(), offset(), colored(), cv(), words()])
