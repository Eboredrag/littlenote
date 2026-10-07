export default defineEventHandler(async (event) => {
  const { meta, pdf } = await renderEdits(event, true)
  const base = meta.name.replace(/\.pdf$/i, '').replace(/[^\w.\- ]+/g, '_') || 'document'
  setHeader(event, 'content-disposition', `attachment; filename="${base}-edited.pdf"`)
  return Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength)
})
