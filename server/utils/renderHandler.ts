import type { H3Event } from 'h3'
import type { EditOp } from '#shared/types'
import { RENDER_REPORT_HEADER } from '#shared/types'
import { applyOps } from './applyOps'

const OP_TYPES = new Set(['editBlock', 'addText', 'deletePage', 'rotatePage', 'reorderPages'])

/** Shared body of the render (preview) and export endpoints. */
export async function renderEdits(event: H3Event, includePageOps: boolean) {
  const id = assertId(getRouterParam(event, 'id'))
  const meta = await touchUpload(id)
  const body = await readBody<{ ops?: EditOp[] }>(event)
  const ops = Array.isArray(body?.ops) ? body.ops.filter(o => o && OP_TYPES.has(o.type)).slice(0, 2000) : []
  const [bytes, model] = await Promise.all([readUploadPdf(id), readUploadModel(id, meta)])
  let result
  try {
    result = await applyOps(bytes, ops, model, { loadFont: loadBundledFont, includePageOps })
  }
  catch (err) {
    throw createError({ statusCode: 422, statusMessage: err instanceof Error && err.message.includes('at least one page') ? err.message : 'These changes couldn’t be applied to this PDF.' })
  }
  setExpiryHeader(event, meta)
  setHeader(event, 'content-type', 'application/pdf')
  setHeader(event, RENDER_REPORT_HEADER, encodeURIComponent(JSON.stringify(result.report)))
  setHeader(event, 'access-control-expose-headers', `${RENDER_REPORT_HEADER}, x-expires-at`)
  return { meta, pdf: result.pdf }
}
