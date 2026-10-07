export default defineEventHandler(async (event) => {
  const { pdf } = await renderEdits(event, false)
  return Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength)
})
