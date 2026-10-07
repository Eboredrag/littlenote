export default defineEventHandler(async (event) => {
  const id = assertId(getRouterParam(event, 'id'))
  const meta = await touchUpload(id)
  setExpiryHeader(event, meta)
  return readUploadModel(id, meta)
})
