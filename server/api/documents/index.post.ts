import { MAX_UPLOAD_BYTES, UPLOAD_TTL_MS } from '#shared/types'
import { buildModel } from '../../utils/model'
import { openPdf, PdfOpenError, takeBytes } from '../../utils/mupdf'

export default defineEventHandler(async (event) => {
  const length = Number(getHeader(event, 'content-length') ?? 0)
  if (length > MAX_UPLOAD_BYTES + 64 * 1024)
    throw createError({ statusCode: 413, statusMessage: 'This file is larger than 50 MB.' })

  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file')
  const password = parts?.find(p => p.name === 'password')?.data.toString('utf8') || undefined
  if (!file?.data?.length) throw createError({ statusCode: 400, statusMessage: 'Choose a PDF to open.' })
  if (file.data.length > MAX_UPLOAD_BYTES) throw createError({ statusCode: 413, statusMessage: 'This file is larger than 50 MB.' })

  let bytes: Uint8Array = new Uint8Array(file.data)
  try {
    const doc = openPdf(bytes, password)
    try {
      // Password-protected files are stored and edited without their password.
      if (password) bytes = takeBytes(doc.saveToBuffer('decrypt'))
    }
    finally {
      doc.destroy()
    }
  }
  catch (err) {
    if (err instanceof PdfOpenError) {
      throw createError({ statusCode: err.code === 'encrypted' ? 401 : 415, statusMessage: err.message, data: { code: err.code } })
    }
    throw err
  }

  const now = Date.now()
  const meta = { id: newUploadId(), name: (file.filename || 'document.pdf').slice(0, 200), bytes: bytes.byteLength, createdAt: now, expiresAt: now + UPLOAD_TTL_MS }
  const model = buildModel(bytes, meta)
  await saveUpload(meta, bytes, model)
  setExpiryHeader(event, meta)
  return model
})
