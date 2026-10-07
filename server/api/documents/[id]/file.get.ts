export default defineEventHandler(async (event) => {
  const id = assertId(getRouterParam(event, 'id'))
  const meta = await touchUpload(id)
  setExpiryHeader(event, meta)
  setHeader(event, 'content-type', 'application/pdf')
  return Buffer.from(await readUploadPdf(id))
})
