import { defineStore } from 'pinia'
import type { AddTextOp, Block, DocModel, EditBlockOp, EditOp, NewTextStyle, OpReport, RenderReport, StyleOverride, TextOp } from '#shared/types'
import { RENDER_REPORT_HEADER } from '#shared/types'

export type Selection =
  | { kind: 'block', page: number, blockId: string }
  | { kind: 'added', page: number, opId: string }

export type Panel = 'pages' | 'changes' | null

const uid = () => Math.random().toString(36).slice(2, 10)
const short = (s: string, n = 28) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

export const useEditor = defineStore('editor', () => {
  const model = shallowRef<DocModel | null>(null)
  const originalBytes = shallowRef<Uint8Array | null>(null)
  /** Latest server render of the text edits (page operations are shown client-side). */
  const previewBytes = shallowRef<Uint8Array | null>(null)
  /** Per-page edit key the current preview was rendered with. */
  const previewKeys = shallowRef<Record<number, string>>({})

  const ops = ref<EditOp[]>([])
  const past = ref<EditOp[][]>([])
  const future = ref<EditOp[][]>([])
  const reports = ref<Record<string, OpReport>>({})

  const selection = ref<Selection | null>(null)
  const editing = ref<string | null>(null)
  const mode = ref<'select' | 'addText'>('select')
  const panel = ref<Panel>(null)
  const zoom = ref(1)

  const expiresAt = ref(0)
  const deleted = ref(false)
  const renderStatus = ref<'idle' | 'waiting' | 'rendering' | 'error'>('idle')
  const renderError = ref('')
  const announcement = ref('')
  /** Edit list at the last successful download, to warn before closing unsaved work. */
  const downloadedKey = ref('[]')

  const pageCount = computed(() => model.value?.pageCount ?? 0)

  function reset(next: DocModel, bytes: Uint8Array) {
    model.value = next
    originalBytes.value = bytes
    previewBytes.value = null
    previewKeys.value = {}
    ops.value = []
    past.value = []
    future.value = []
    reports.value = {}
    selection.value = null
    editing.value = null
    mode.value = 'select'
    panel.value = null
    expiresAt.value = next.expiresAt
    deleted.value = false
    renderStatus.value = 'idle'
    downloadedKey.value = '[]'
    lastRendered = '[]'
  }

  const hasUnsavedChanges = computed(() => ops.value.length > 0 && JSON.stringify(ops.value) !== downloadedKey.value)

  /** Closes the current file: deletes the server copy and forgets this tab's edits. */
  async function close() {
    const id = model.value?.id
    if (!id) return
    const key = storageKey()
    const wasDeleted = deleted.value
    clearTimeout(timer)
    inflight?.abort()
    model.value = null
    originalBytes.value = null
    previewBytes.value = null
    previewKeys.value = {}
    ops.value = []
    past.value = []
    future.value = []
    reports.value = {}
    selection.value = null
    editing.value = null
    panel.value = null
    mode.value = 'select'
    try {
      if (key) sessionStorage.removeItem(key)
    }
    catch {}
    if (!wasDeleted) await fetch(`/api/documents/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  // Keep the edit list across reloads of the same document (this tab only).
  const storageKey = () => (model.value ? `littlenote:ops:${model.value.id}` : '')
  watch(ops, (list) => {
    const key = storageKey()
    if (!key || !import.meta.client) return
    try {
      sessionStorage.setItem(key, JSON.stringify(list))
    }
    catch {}
  })

  function restore() {
    const key = storageKey()
    if (!key || !import.meta.client) return
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? '[]') as EditOp[]
      if (Array.isArray(saved) && saved.length) {
        ops.value = saved
        // Restored edits stay undoable: one step back returns to the original file.
        past.value = [[]]
        announce(`${saved.length} ${saved.length === 1 ? 'change' : 'changes'} restored from earlier`)
        scheduleRender()
      }
    }
    catch {}
  }

  function announce(message: string) {
    announcement.value = ''
    nextTick(() => { announcement.value = message })
  }

  function blockById(page: number, id: string): Block | undefined {
    return model.value?.pages[page]?.blocks.find(b => b.id === id)
  }

  // --- History -------------------------------------------------------------

  function commit(next: EditOp[], message: string) {
    past.value.push(ops.value)
    future.value = []
    ops.value = next
    announce(message)
    scheduleRender()
  }

  function undo() {
    const prev = past.value.pop()
    if (!prev) return
    future.value.push(ops.value)
    ops.value = prev
    editing.value = null
    announce('Undid the last change')
    scheduleRender()
  }

  function redo() {
    const next = future.value.pop()
    if (!next) return
    past.value.push(ops.value)
    ops.value = next
    announce('Redid the change')
    scheduleRender()
  }

  // --- Text edits ------------------------------------------------------------

  const opForBlock = (blockId: string) =>
    ops.value.find((o): o is EditBlockOp => o.type === 'editBlock' && o.blockId === blockId)

  function upsertBlock(block: Block, page: number, patch: { text?: string, style?: StyleOverride }, message: string) {
    const existing = opForBlock(block.id)
    const text = patch.text ?? existing?.text ?? block.text
    const style = { ...existing?.style, ...patch.style }
    for (const k of Object.keys(style) as (keyof StyleOverride)[]) if (style[k] === undefined) delete style[k]
    const unchanged = text === block.text && Object.keys(style).length === 0
    const rest = ops.value.filter(o => o !== existing)
    if (unchanged) {
      if (existing) commit(rest, `Restored the original text on page ${page + 1}`)
      return
    }
    const op: EditBlockOp = { id: existing?.id ?? uid(), type: 'editBlock', page, blockId: block.id, text, style: Object.keys(style).length ? style : undefined }
    commit([...rest, op], message)
  }

  function editBlockText(block: Block, page: number, text: string) {
    const current = opForBlock(block.id)?.text ?? block.text
    if (text === current) return
    upsertBlock(block, page, { text }, `Changed text on page ${page + 1}`)
  }

  function styleBlock(block: Block, page: number, style: StyleOverride) {
    upsertBlock(block, page, { style }, `Changed style on page ${page + 1}`)
  }

  /** Removes a field's text from the page; it can be restored from the card or the change list. */
  function deleteBlock(block: Block, page: number) {
    if (!block.editable) return
    if (selection.value?.kind === 'block' && selection.value.blockId === block.id) editing.value = null
    upsertBlock(block, page, { text: '' }, `Deleted “${short(block.text)}” on page ${page + 1}. You can undo this.`)
  }

  function revertBlock(blockId: string) {
    const op = opForBlock(blockId)
    if (op) commit(ops.value.filter(o => o !== op), `Restored the original text on page ${op.page + 1}`)
  }

  /** New text starts in the page's main body font, size and colour. */
  function defaultNewStyle(page: number): NewTextStyle {
    const fallback: NewTextStyle = { font: 'sans', size: 12, color: [0, 0, 0], bold: false, italic: false, align: 'left' }
    const blocks = model.value?.pages[page]?.blocks ?? []
    const weight = new Map<string, { n: number, run: Block['lines'][number]['runs'][number] }>()
    for (const b of blocks) for (const l of b.lines) for (const r of l.runs) {
      const k = `${r.fontKey}|${r.size}|${r.color.join()}`
      const e = weight.get(k) ?? { n: 0, run: r }
      e.n += r.text.trim().length
      weight.set(k, e)
    }
    const top = [...weight.values()].sort((a, b) => b.n - a.n)[0]?.run
    const info = top ? model.value?.fonts[top.fontKey] : undefined
    if (!top || !info || info.type === 'Type3') return fallback
    return { ...fallback, font: info.fallback, fontKey: info.key, size: top.size, color: top.color, bold: info.bold, italic: info.italic }
  }

  function addTextAt(page: number, x: number, y: number) {
    const width = Math.max(120, Math.min(260, (model.value?.pages[page]?.width ?? 600) - x - 24))
    const op: AddTextOp = { id: uid(), type: 'addText', page, x, y, width, text: '', style: defaultNewStyle(page) }
    past.value.push(ops.value)
    future.value = []
    ops.value = [...ops.value, op]
    mode.value = 'select'
    selection.value = { kind: 'added', page, opId: op.id }
    editing.value = op.id
    return op.id
  }

  function updateAdded(opId: string, patch: Partial<Pick<AddTextOp, 'text' | 'x' | 'y' | 'width'>> & { style?: Partial<NewTextStyle> }) {
    const op = ops.value.find((o): o is AddTextOp => o.id === opId && o.type === 'addText')
    if (!op) return
    const next: AddTextOp = { ...op, ...patch, style: { ...op.style, ...patch.style } }
    if (next.text === op.text && JSON.stringify(next) === JSON.stringify(op)) return
    // Typing into a brand-new box finishes the "add" step rather than adding a second undo entry.
    const replaceInPlace = op.text === '' && past.value.length > 0
    const list = ops.value.map(o => (o === op ? next : o))
    if (replaceInPlace) {
      ops.value = list
      announce(`Added text on page ${op.page + 1}`)
      scheduleRender()
    }
    else commit(list, `Changed added text on page ${op.page + 1}`)
  }

  function removeOp(opId: string) {
    const op = ops.value.find(o => o.id === opId)
    if (!op) return
    if (selection.value?.kind === 'added' && selection.value.opId === opId) selection.value = null
    commit(ops.value.filter(o => o !== op), 'Undid that change')
  }

  /** Drops empty new text boxes when they lose focus. */
  function pruneEmptyAdded(opId: string) {
    const op = ops.value.find(o => o.id === opId)
    if (op?.type === 'addText' && !op.text.trim()) {
      ops.value = ops.value.filter(o => o !== op)
      past.value.pop()
      if (selection.value?.kind === 'added' && selection.value.opId === opId) selection.value = null
    }
  }

  // --- Pages -----------------------------------------------------------------

  const pageOrder = computed(() => {
    let order = Array.from({ length: pageCount.value }, (_, i) => i)
    for (const op of ops.value) {
      if (op.type === 'deletePage') order = order.filter(i => i !== op.page)
      else if (op.type === 'reorderPages') order = op.order.filter(i => order.includes(i))
    }
    return order
  })

  function rotationOf(page: number) {
    let r = 0
    for (const op of ops.value) if (op.type === 'rotatePage' && op.page === page) r += op.angle
    return ((r % 360) + 360) % 360
  }

  function rotatePage(page: number) {
    const existing = ops.value.find(o => o.type === 'rotatePage' && o.page === page)
    const rest = ops.value.filter(o => o !== existing)
    const angle = ((rotationOf(page) + 90) % 360) as 0 | 90 | 180 | 270
    const next = angle === 0 ? rest : [...rest, { id: existing?.id ?? uid(), type: 'rotatePage' as const, page, angle }]
    commit(next, `Rotated page ${page + 1}`)
  }

  function deletePage(page: number) {
    if (pageOrder.value.length <= 1) return
    if (selection.value?.page === page) selection.value = null
    commit([...ops.value, { id: uid(), type: 'deletePage', page }], `Deleted page ${page + 1}. You can undo this.`)
  }

  function movePage(page: number, by: -1 | 1) {
    const order = [...pageOrder.value]
    const at = order.indexOf(page)
    const to = at + by
    if (at < 0 || to < 0 || to >= order.length) return
    order.splice(at, 1)
    order.splice(to, 0, page)
    setOrder(order, `Moved page ${page + 1} to position ${to + 1}`)
  }

  function setOrder(order: number[], message: string) {
    const existing = ops.value.find(o => o.type === 'reorderPages')
    const rest = ops.value.filter(o => o !== existing)
    const identity = order.every((p, i, all) => i === 0 || all[i - 1]! < p)
    commit(identity ? rest : [...rest, { id: existing?.id ?? uid(), type: 'reorderPages', order }], message)
  }

  // --- Change list -------------------------------------------------------------

  interface Change { id: string, label: string, detail?: string, page?: number, warning?: string }

  const changes = computed<Change[]>(() => ops.value.flatMap((op): Change[] => {
    const report = reports.value[op.id]
    const warning = report?.substituted ? report.reason : undefined
    switch (op.type) {
      case 'editBlock': {
        const block = blockById(op.page, op.blockId)
        const before = block?.text ?? ''
        const label = op.text === before ? `Restyled “${short(before)}”` : op.text.trim() ? `“${short(before, 22)}” → “${short(op.text, 22)}”` : `Deleted “${short(before)}”`
        const detail = report?.fontUsed ? `Page ${op.page + 1} · ${report.fontUsed}` : `Page ${op.page + 1}`
        return [{ id: op.id, label, detail, page: op.page, warning }]
      }
      case 'addText':
        if (!op.text.trim()) return []
        return [{ id: op.id, label: `Added “${short(op.text)}”`, detail: `Page ${op.page + 1}${report?.fontUsed ? ` · ${report.fontUsed}` : ''}`, page: op.page }]
      case 'deletePage': return [{ id: op.id, label: `Deleted page ${op.page + 1}` }]
      case 'rotatePage': return [{ id: op.id, label: `Rotated page ${op.page + 1} by ${op.angle}°` }]
      case 'reorderPages': return [{ id: op.id, label: 'Changed the page order' }]
    }
  }))

  // --- Rendering ---------------------------------------------------------------

  const textOps = computed(() => ops.value.filter((o): o is TextOp => (o.type === 'editBlock' || o.type === 'addText') && (o.type !== 'addText' || !!o.text.trim())))

  function pageKey(page: number, list: TextOp[] = textOps.value) {
    return JSON.stringify(list.filter(o => o.page === page))
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let inflight: AbortController | null = null
  let lastRendered = '[]'

  function scheduleRender() {
    clearTimeout(timer)
    renderStatus.value = 'waiting'
    timer = setTimeout(render, 450)
  }

  async function render() {
    const id = model.value?.id
    if (!id || deleted.value) return
    const list = textOps.value
    const key = JSON.stringify(list)
    if (key === lastRendered && renderStatus.value !== 'error') {
      renderStatus.value = 'idle'
      return
    }
    inflight?.abort()
    const controller = inflight = new AbortController()
    renderStatus.value = 'rendering'
    try {
      if (!list.length) {
        previewBytes.value = null
        previewKeys.value = {}
        reports.value = {}
      }
      else {
        const res = await fetch(`/api/documents/${id}/render`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ops: list }),
          signal: controller.signal,
        })
        if (res.status === 410) return markDeleted()
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.statusMessage ?? 'The preview couldn’t be updated.')
        const header = res.headers.get(RENDER_REPORT_HEADER)
        const report: RenderReport = header ? JSON.parse(decodeURIComponent(header)) : { ops: [] }
        trackExpiry(res)
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (controller.signal.aborted) return
        reports.value = Object.fromEntries(report.ops.map(r => [r.opId, r]))
        const keys: Record<number, string> = {}
        for (let p = 0; p < pageCount.value; p++) keys[p] = pageKey(p, list)
        previewKeys.value = keys
        previewBytes.value = bytes
        const swapped = report.ops.filter(r => r.substituted)
        if (swapped.length) announce(`${swapped[0]!.reason}.`)
      }
      lastRendered = key
      renderStatus.value = 'idle'
      renderError.value = ''
    }
    catch (err) {
      if ((err as Error).name === 'AbortError') return
      renderStatus.value = 'error'
      renderError.value = (err as Error).message
    }
    finally {
      if (inflight === controller) inflight = null
    }
  }

  function trackExpiry(res: Response) {
    const at = Number(res.headers.get('x-expires-at'))
    if (at) expiresAt.value = at
  }

  function markDeleted() {
    deleted.value = true
    selection.value = null
    editing.value = null
    renderStatus.value = 'idle'
    announce('The file was deleted from the server.')
  }

  async function deleteFromServer() {
    const id = model.value?.id
    if (!id) return
    await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    markDeleted()
  }

  async function download() {
    const id = model.value?.id
    if (!id) throw new Error('Nothing to download yet.')
    const res = await fetch(`/api/documents/${id}/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops: ops.value }),
    })
    if (res.status === 410) {
      markDeleted()
      throw new Error('The file was deleted from the server, so it can’t be downloaded again.')
    }
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.statusMessage ?? 'The download couldn’t be prepared.')
    trackExpiry(res)
    const blob = await res.blob()
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'edited.pdf'
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    downloadedKey.value = JSON.stringify(ops.value)
    announce(`Downloaded ${name}`)
    return name
  }

  return {
    model, originalBytes, previewBytes, previewKeys, ops, past, future, reports,
    selection, editing, mode, panel, zoom, expiresAt, deleted, renderStatus, renderError, announcement,
    pageCount, pageOrder, changes, textOps, hasUnsavedChanges,
    reset, close, restore, announce, blockById, undo, redo, opForBlock, editBlockText, styleBlock, deleteBlock, revertBlock,
    addTextAt, updateAdded, removeOp, pruneEmptyAdded, rotationOf, rotatePage, deletePage, movePage, setOrder,
    pageKey, scheduleRender, render, deleteFromServer, download, markDeleted, trackExpiry,
  }
})
