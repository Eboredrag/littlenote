import type { PDFDocumentProxy } from 'pdfjs-dist'

let lib: Promise<typeof import('pdfjs-dist')> | null = null

/** Loads pdf.js (client only) with its worker. */
export function loadPdfjs() {
  if (!lib) {
    lib = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })
  }
  return lib
}

export async function openPdfjs(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs()
  // pdf.js transfers the buffer to its worker, so give it a copy.
  return pdfjs.getDocument({ data: bytes.slice() }).promise
}
