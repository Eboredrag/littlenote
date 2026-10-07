import { defineStore } from 'pinia'
import type { DocModel } from '#shared/types'
import { MAX_UPLOAD_BYTES } from '#shared/types'
import { useEditor } from '~/stores/editor'

/** Opening a PDF, shared by the upload page and the editor's "New file" button. */
export const useUpload = defineStore('upload', () => {
  const state = ref<'idle' | 'opening' | 'password' | 'error'>('idle')
  const message = ref('')
  const pending = shallowRef<File | null>(null)
  // Captured at store creation: route composables lose their context after an await.
  const router = useRouter()

  function fail(text: string) {
    state.value = 'error'
    message.value = text
  }

  /** Uploads `file`; on success the previous document is closed and the editor opens the new one. */
  async function open(file: File, password?: string) {
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
      return fail(`“${file.name}” isn’t a PDF. Choose a file that ends in .pdf.`)
    if (file.size > MAX_UPLOAD_BYTES) return fail('This file is larger than 50 MB. Try a smaller copy.')

    const editor = useEditor()
    pending.value = file
    state.value = 'opening'
    message.value = ''
    const form = new FormData()
    form.append('file', file)
    if (password) form.append('password', password)
    try {
      const res = await fetch('/api/documents', { method: 'POST', body: form })
      const body = await res.json().catch(() => null)
      if (res.status === 401) {
        state.value = 'password'
        message.value = password ? 'That password didn’t open the file. Try again.' : ''
        // The password form lives on the upload page.
        if (router.currentRoute.value.path !== '/') {
          await editor.close()
          await router.push('/')
        }
        return
      }
      if (!res.ok) throw new Error(body?.statusMessage ?? 'Something went wrong opening this file.')
      const model = body as DocModel
      const bytes = password
        ? new Uint8Array(await (await fetch(`/api/documents/${model.id}/file`)).arrayBuffer() as ArrayBuffer)
        : new Uint8Array(await file.arrayBuffer())
      await editor.close()
      editor.reset(model, bytes)
      state.value = 'idle'
      pending.value = null
      await router.push(`/edit/${model.id}`)
    }
    catch (err) {
      // The current document (if any) stays open; the caller shows the message.
      fail((err as Error).message)
    }
  }

  function reset() {
    state.value = 'idle'
    message.value = ''
    pending.value = null
  }

  return { state, message, pending, open, reset }
})
