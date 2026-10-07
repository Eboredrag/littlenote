// Upload storage. Files live only as long as the editing session needs them:
// 30 minutes after the last request, or until the user deletes them.
import { randomUUID } from 'node:crypto'
import { readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { DocModel } from '#shared/types'
import { UPLOAD_TTL_MS } from '#shared/types'

export interface UploadMeta {
  id: string
  name: string
  bytes: number
  createdAt: number
  expiresAt: number
}

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const store = () => useStorage('uploads')

/** Folder holding one sub-folder per upload (runtime config `uploadsDir`, env NUXT_UPLOADS_DIR). */
export const uploadsDir = () => resolve(useRuntimeConfig().uploadsDir)

export const newUploadId = () => randomUUID()

export function assertId(id: string | undefined): string {
  if (!id || !ID_RE.test(id)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return id
}

export async function saveUpload(meta: UploadMeta, pdf: Uint8Array, model: DocModel) {
  const s = store()
  await s.setItemRaw(`${meta.id}:original.pdf`, pdf)
  await s.setItem(`${meta.id}:model.json`, model)
  await s.setItem(`${meta.id}:meta.json`, meta)
}

export async function deleteUpload(id: string) {
  if (!ID_RE.test(id)) return
  const s = store()
  await Promise.all(['original.pdf', 'model.json', 'meta.json'].map(k => s.removeItem(`${id}:${k}`)))
  // The storage driver only removes files; drop the upload's folder as well.
  await rm(join(uploadsDir(), id), { recursive: true, force: true })
}

/** Loads an upload and extends its lifetime, or throws 410 when it is gone. */
export async function touchUpload(id: string) {
  const s = store()
  const meta = await s.getItem<UploadMeta>(`${id}:meta.json`)
  if (!meta || meta.expiresAt < Date.now()) {
    if (meta) await deleteUpload(id)
    throw createError({ statusCode: 410, statusMessage: 'This file has been deleted from the server. Open it again to keep editing.' })
  }
  meta.expiresAt = Date.now() + UPLOAD_TTL_MS
  await s.setItem(`${id}:meta.json`, meta)
  return meta
}

export async function readUploadPdf(id: string) {
  const raw = await store().getItemRaw(`${id}:original.pdf`)
  if (!raw) throw createError({ statusCode: 410, statusMessage: 'This file has been deleted from the server.' })
  return raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer)
}

export async function readUploadModel(id: string, meta: UploadMeta) {
  const model = await store().getItem<DocModel>(`${id}:model.json`)
  if (!model) throw createError({ statusCode: 410, statusMessage: 'This file has been deleted from the server.' })
  return { ...model, expiresAt: meta.expiresAt }
}

/** Deletes expired uploads, and any upload folder left without its metadata. */
export async function cleanupExpiredUploads() {
  const s = store()
  const entries = await readdir(uploadsDir(), { withFileTypes: true }).catch(() => [])
  const ids = entries.filter(e => e.isDirectory() && ID_RE.test(e.name)).map(e => e.name)
  let removed = 0
  for (const id of ids) {
    const meta = await s.getItem<UploadMeta>(`${id}:meta.json`)
    if (!meta || meta.expiresAt < Date.now()) {
      await deleteUpload(id)
      removed++
    }
  }
  return removed
}

export async function loadBundledFont(file: string) {
  const raw = await useStorage('assets:fonts').getItemRaw(file)
  if (!raw) throw new Error(`Missing bundled font ${file}`)
  return raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer)
}

export function setExpiryHeader(event: Parameters<typeof setHeader>[0], meta: UploadMeta) {
  setHeader(event, 'x-expires-at', String(meta.expiresAt))
  setHeader(event, 'cache-control', 'no-store')
}
