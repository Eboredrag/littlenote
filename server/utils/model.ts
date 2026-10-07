import type { DocModel } from '#shared/types'
import { extractDocument } from './extract'
import { openPdf } from './mupdf'

/** Parses a PDF into the editor model. `id` and `expiresAt` are filled in by the caller. */
export function buildModel(bytes: Uint8Array, meta: { id: string, name: string, expiresAt: number }): DocModel {
  const doc = openPdf(bytes)
  try {
    const { pages, fonts } = extractDocument(doc)
    return { ...meta, bytes: bytes.byteLength, pageCount: pages.length, pages, fonts }
  }
  finally {
    doc.destroy()
  }
}
