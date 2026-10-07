import * as mupdf from 'mupdf'
import type { PDFDocument } from 'mupdf'

export { mupdf }

export class PdfOpenError extends Error {
  constructor(public code: 'not_pdf' | 'encrypted' | 'damaged', message: string) {
    super(message)
  }
}

/** Opens bytes as a PDF document, authenticating with `password` when needed. */
export function openPdf(bytes: Uint8Array, password?: string): PDFDocument {
  let doc
  try {
    doc = mupdf.Document.openDocument(bytes, 'application/pdf')
  }
  catch {
    throw new PdfOpenError('not_pdf', 'This file could not be read as a PDF.')
  }
  const pdf = doc.asPDF()
  if (!pdf) {
    doc.destroy()
    throw new PdfOpenError('not_pdf', 'This file could not be read as a PDF.')
  }
  if (pdf.needsPassword()) {
    if (!password || !pdf.authenticatePassword(password)) {
      pdf.destroy()
      throw new PdfOpenError('encrypted', password ? 'That password did not open the file.' : 'This PDF is protected by a password.')
    }
  }
  return pdf
}

/** Copies a MuPDF buffer into ordinary memory and frees it. (`asUint8Array` is only a view into MuPDF's memory.) */
export function takeBytes(buffer: mupdf.Buffer): Uint8Array {
  try {
    return buffer.asUint8Array().slice()
  }
  finally {
    buffer.destroy()
  }
}

/** Runs `fn` with a MuPDF object and frees the object afterwards. */
export function using<T extends { destroy: () => void }, R>(obj: T, fn: (obj: T) => R): R {
  try {
    return fn(obj)
  }
  finally {
    obj.destroy()
  }
}
