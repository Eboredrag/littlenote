export default defineEventHandler(async (event) => {
  const id = assertId(getRouterParam(event, 'id'))
  await deleteUpload(id)
  setHeader(event, 'cache-control', 'no-store')
  return { deleted: true }
})
