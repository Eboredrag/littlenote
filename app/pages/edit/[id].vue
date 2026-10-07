<script setup lang="ts">
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Check, Clock, Download, FilePlus2, Files, House, ListChecks, LoaderCircle, Minus, Plus, Redo2, ShieldCheck, Trash2, Type, Undo2, X } from 'lucide-vue-next'
import type { DocModel } from '#shared/types'
import { useEditor } from '~/stores/editor'
import { useUpload } from '~/stores/upload'
import { openPdfjs } from '~/composables/usePdfjs'
import { useWide } from '~/composables/useMedia'
import { formatTime } from '~/utils/style'

definePageMeta({ key: route => route.fullPath })

const route = useRoute()
const editor = useEditor()
const upload = useUpload()
const wide = useWide()
const id = computed(() => String(route.params.id))

useHead({ title: () => (editor.model ? `${editor.model.name} · littlenote` : 'littlenote') })
// Editing sessions are private: never indexed, and their address isn't sent to other sites.
useSeoMeta({ robots: 'noindex, nofollow', referrer: 'no-referrer' })

// --- Loading -----------------------------------------------------------------
const loadError = ref('')

async function load() {
  if (editor.model?.id === id.value && editor.originalBytes) return
  try {
    const res = await fetch(`/api/documents/${id.value}`)
    if (res.status === 410 || res.status === 404) {
      loadError.value = 'This file has been deleted from the server, so it can’t be opened again. Open the original PDF to start over.'
      return
    }
    if (!res.ok) throw new Error('This file couldn’t be loaded.')
    const model = await res.json() as DocModel
    const bytes = new Uint8Array(await (await fetch(`/api/documents/${id.value}/file`)).arrayBuffer() as ArrayBuffer)
    editor.reset(model, bytes)
    editor.restore()
  }
  catch (err) {
    loadError.value = (err as Error).message
  }
}

// --- pdf.js document for the current preview ------------------------------------
const pdfDoc = shallowRef<PDFDocumentProxy | null>(null)
const docKeys = shallowRef<Record<number, string>>({})

watch(() => editor.previewBytes ?? editor.originalBytes, async (bytes) => {
  if (!bytes) return
  const keys = editor.previewBytes ? editor.previewKeys : {}
  const next = await openPdfjs(bytes)
  if ((editor.previewBytes ?? editor.originalBytes) !== bytes) return void next.loadingTask.destroy()
  const prev = pdfDoc.value
  docKeys.value = keys
  pdfDoc.value = next
  if (prev) setTimeout(() => prev.loadingTask.destroy(), 1500)
}, { immediate: true })

onMounted(load)
onBeforeUnmount(() => pdfDoc.value?.loadingTask.destroy())

// --- Zoom ----------------------------------------------------------------------
const scroller = ref<HTMLElement>()
const columnWidth = ref(800)
const userZoom = ref(1)
const maxPageWidth = computed(() => Math.max(1, ...(editor.model?.pages.map(p => (editor.rotationOf(p.index) % 180 ? p.height : p.width)) ?? [612])))
const fit = computed(() => Math.min(columnWidth.value, 760) / maxPageWidth.value)
watchEffect(() => { editor.zoom = Math.round(fit.value * userZoom.value * 1000) / 1000 })

let resizeObs: ResizeObserver | undefined
onMounted(() => {
  resizeObs = new ResizeObserver(([e]) => { columnWidth.value = Math.max(240, (e?.contentRect.width ?? 800) - (wide.value ? 48 : 24)) })
  watch(scroller, el => el && resizeObs!.observe(el), { immediate: true })
})
onBeforeUnmount(() => resizeObs?.disconnect())

function setZoom(z: number) {
  userZoom.value = Math.min(4, Math.max(0.4, Math.round(z * 100) / 100))
}

function onWheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  setZoom(userZoom.value * Math.exp(-e.deltaY / 300))
}

// Two-finger pinch on touch screens.
const pointers = new Map<number, { x: number, y: number }>()
let pinchStart = 0
let pinchZoom = 1
function onPointerDown(e: PointerEvent) {
  if (e.pointerType !== 'touch') return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinchStart = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    pinchZoom = userZoom.value
  }
}
function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()]
    setZoom(pinchZoom * Math.hypot(a!.x - b!.x, a!.y - b!.y) / pinchStart)
  }
}
function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinchStart = 0
}

// --- Selection card placement ---------------------------------------------------
const cardPos = ref<{ top: number, left: number, maxHeight: number }>()
/** The top pill shares the page column's width and axis on wide screens. */
const pillWidth = computed(() => (wide.value ? Math.min(columnWidth.value + 24, Math.max(640, editor.zoom * maxPageWidth.value)) : 0))
const canFloat = computed(() => wide.value && columnWidth.value - editor.zoom * maxPageWidth.value > 2 * 356 - 48)

function placeCard() {
  const sel = editor.selection
  if (!sel || !canFloat.value) return (cardPos.value = undefined)
  const selector = sel.kind === 'block' ? `[data-block="${sel.blockId}"]` : '.box.selected, .field'
  const el = document.querySelector<HTMLElement>(selector)
  const paper = document.querySelector<HTMLElement>(`[data-page="${sel.page}"]`)
  if (!el || !paper) return
  const r = el.getBoundingClientRect()
  const p = paper.getBoundingClientRect()
  // The bar only limits the card when they overlap horizontally.
  const bar = document.querySelector<HTMLElement>('.bar')?.getBoundingClientRect()
  const left = Math.min(p.right + 24, window.innerWidth - 340 - 28)
  const bottomLimit = bar && left < bar.right ? bar.top - 16 : window.innerHeight - 16
  const top = Math.min(Math.max(r.top - 8, 84), bottomLimit - 320)
  cardPos.value = { top, left, maxHeight: bottomLimit - top }
}

let raf = 0
const schedulePlace = () => {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(placeCard)
}
watch(() => [editor.selection, editor.editing, editor.zoom, canFloat.value], () => nextTick(schedulePlace), { deep: true })
onMounted(() => window.addEventListener('resize', schedulePlace))
onBeforeUnmount(() => window.removeEventListener('resize', schedulePlace))

// --- Panels and modes ---------------------------------------------------------
function togglePanel(p: 'pages' | 'changes') {
  editor.panel = editor.panel === p ? null : p
  if (!wide.value && editor.panel) editor.selection = null
}

watch(() => editor.selection, (s) => {
  if (!s || wide.value) return
  editor.panel = null
  // Keep the selected text above the bottom sheet.
  nextTick(() => {
    const el = document.querySelector<HTMLElement>(s.kind === 'block' ? `[data-block="${s.blockId}"]` : '.box.selected')
    const r = el?.getBoundingClientRect()
    if (el && r && (r.bottom > window.innerHeight * 0.38 || r.top < 80)) el.scrollIntoView({ block: 'start', behavior: 'smooth' })
  })
})

function toggleAddText() {
  editor.mode = editor.mode === 'addText' ? 'select' : 'addText'
  editor.selection = null
  if (editor.mode === 'addText') editor.announce('Tap the page where the new text should go.')
}

function jump(page: number) {
  document.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (!wide.value) editor.panel = null
}

function onBackgroundClick() {
  if (editor.mode === 'select') editor.selection = null
}

// --- Keyboard shortcuts ---------------------------------------------------------
function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  const typing = t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
  const mod = e.metaKey || e.ctrlKey
  if (mod && !typing && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    e.shiftKey ? editor.redo() : editor.undo()
  }
  else if (mod && !typing && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    editor.redo()
  }
  else if (mod && (e.key === '=' || e.key === '+')) {
    e.preventDefault()
    setZoom(userZoom.value * 1.2)
  }
  else if (mod && e.key === '-') {
    e.preventDefault()
    setZoom(userZoom.value / 1.2)
  }
  else if (mod && e.key === '0') {
    e.preventDefault()
    setZoom(1)
  }
  else if (e.key === 'Escape' && !typing) {
    if (editor.mode === 'addText') editor.mode = 'select'
    else if (editor.panel && !editor.selection) editor.panel = null
    else editor.selection = null
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// --- Download -------------------------------------------------------------------
const downloadState = ref<'idle' | 'working' | 'done' | 'error'>('idle')
const downloadMessage = ref('')
const downloadedName = ref('')

async function download() {
  if (editor.editing) (document.activeElement as HTMLElement)?.blur()
  downloadState.value = 'working'
  try {
    downloadedName.value = await editor.download()
    downloadState.value = 'done'
  }
  catch (err) {
    downloadState.value = 'error'
    downloadMessage.value = (err as Error).message
  }
}

async function deleteNow() {
  await editor.deleteFromServer()
  downloadState.value = 'idle'
}

// --- Closing this file and opening another --------------------------------------
const confirm = ref<'home' | 'new' | null>(null)
const confirmEl = ref<HTMLElement>()
const newInput = ref<HTMLInputElement>()

const mustConfirm = () => editor.hasUnsavedChanges && !editor.deleted

async function goHome() {
  confirm.value = null
  upload.reset()
  await editor.close()
  await navigateTo('/')
}

function requestHome() {
  if (mustConfirm()) confirm.value = 'home'
  else goHome()
}

function chooseNewFile() {
  confirm.value = null
  newInput.value?.click()
}

function requestNew() {
  if (mustConfirm()) confirm.value = 'new'
  else chooseNewFile()
}

function onNewPicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (file) upload.open(file)
}

watch(confirm, async (c) => {
  if (!c) return
  await nextTick()
  confirmEl.value?.querySelector<HTMLElement>('button')?.focus()
})

const changeCount = computed(() => editor.changes.length)
const pageWord = computed(() => `${editor.pageOrder.length} ${editor.pageOrder.length === 1 ? 'page' : 'pages'}`)
</script>

<template>
  <div class="shell">
    <p class="visually-hidden" aria-live="polite" aria-atomic="true">{{ editor.announcement }}</p>

    <header class="top">
      <div class="file card" :style="pillWidth ? { width: `${pillWidth}px`, flex: 'none' } : undefined">
        <div class="file-nav" role="group" aria-label="File">
          <button class="btn btn-icon" type="button" aria-label="Home: close this file" title="Home" @click="requestHome"><House /></button>
          <button class="btn btn-soft new" type="button" aria-label="Open a new file" title="Open a new file" @click="requestNew"><FilePlus2 /><span class="long" aria-hidden="true">New file</span></button>
          <input ref="newInput" class="visually-hidden" type="file" accept="application/pdf,.pdf" tabindex="-1" aria-hidden="true" @change="onNewPicked">
        </div>
        <div class="file-text">
          <h1 class="name">{{ editor.model?.name ?? (loadError ? 'File not available' : 'Opening…') }}</h1>
          <p class="meta">
            <span v-if="editor.model" class="num">{{ pageWord }}</span>
            <span v-if="editor.renderStatus === 'rendering' || editor.renderStatus === 'waiting'" class="sync"><LoaderCircle class="spin" aria-hidden="true" />Updating preview</span>
            <span v-else-if="editor.renderStatus === 'error'" class="sync">Preview didn’t update · <button class="link" type="button" @click="editor.render()">Try again</button></span>
          </p>
        </div>
        <div v-if="editor.model && !editor.deleted" class="keep">
          <span class="keep-text"><Clock aria-hidden="true" /><span><span class="keep-label">Kept until </span><time class="num">{{ formatTime(editor.expiresAt) }}</time></span></span>
          <button class="btn btn-soft" type="button" aria-label="Delete the file from the server now" @click="deleteNow"><Trash2 /><span aria-hidden="true" class="long">Delete now</span><span aria-hidden="true" class="short">Delete</span></button>
        </div>
        <div v-else-if="editor.deleted" class="keep deleted" role="status">
          <span class="keep-text"><ShieldCheck aria-hidden="true" /><span>Deleted from the server</span></span>
          <NuxtLink class="btn btn-soft" to="/"><FilePlus2 /><span>Open another PDF</span></NuxtLink>
        </div>
        <div v-if="wide" class="zoom" role="group" aria-label="Zoom">
          <button class="btn btn-icon" type="button" aria-label="Zoom out" @click="setZoom(userZoom / 1.2)"><Minus /></button>
          <button class="btn zoom-value num" type="button" aria-label="Reset zoom" @click="setZoom(1)">{{ Math.round(userZoom * 100) }}%</button>
          <button class="btn btn-icon" type="button" aria-label="Zoom in" @click="setZoom(userZoom * 1.2)"><Plus /></button>
        </div>
      </div>
    </header>

    <section
      v-if="confirm && editor.model"
      ref="confirmEl"
      class="confirm card"
      role="dialog"
      aria-modal="false"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      @keydown.esc="confirm = null"
    >
      <h2 id="confirm-title">{{ confirm === 'home' ? `Close ${editor.model.name}?` : 'Open a new file?' }}</h2>
      <p v-if="editor.hasUnsavedChanges" id="confirm-body">
        You have {{ changeCount }} {{ changeCount === 1 ? 'change' : 'changes' }} you haven’t downloaded.
        {{ confirm === 'home' ? 'Closing' : 'Opening a new file' }} deletes this file and your changes from the server.
      </p>
      <p v-else id="confirm-body">Your changes are downloaded. {{ confirm === 'home' ? 'Closing' : 'Opening a new file' }} deletes this file from the server.</p>
      <div class="confirm-actions">
        <button class="btn btn-soft" type="button" @click="confirm = null">Keep editing</button>
        <button v-if="editor.hasUnsavedChanges" class="btn btn-soft" type="button" :disabled="downloadState === 'working'" @click="download">
          <LoaderCircle v-if="downloadState === 'working'" class="spin" /><Download v-else />Download first
        </button>
        <button class="btn btn-primary" type="button" @click="confirm === 'home' ? goHome() : chooseNewFile()">
          {{ confirm === 'home' ? 'Close file' : 'Choose new file' }}
        </button>
      </div>
    </section>

    <div v-if="upload.state === 'opening' || upload.state === 'error'" class="toast card upload-status" role="status">
      <template v-if="upload.state === 'opening'">
        <LoaderCircle class="spin ok" aria-hidden="true" />
        <p><strong>Opening {{ upload.pending?.name }}</strong> Reading its pages and fonts…</p>
      </template>
      <template v-else>
        <p><strong>That file didn’t open.</strong> {{ upload.message }}</p>
        <button class="btn btn-soft" type="button" @click="chooseNewFile">Choose another</button>
        <button class="btn btn-icon" type="button" aria-label="Dismiss" @click="upload.reset()"><X /></button>
      </template>
    </div>

    <div v-if="editor.mode === 'addText'" class="hint card" role="status">
      <Type aria-hidden="true" />
      <span>Tap the page where the new text should go</span>
      <button class="btn btn-soft" type="button" @click="editor.mode = 'select'">Cancel</button>
    </div>

    <main
      ref="scroller"
      class="stage"
      :class="{ 'with-rail': wide && editor.panel === 'pages' }"
      @click="onBackgroundClick"
      @scroll.passive="schedulePlace"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div v-if="loadError" class="gone card" role="alert">
        <h2>We couldn’t open this file</h2>
        <p>{{ loadError }}</p>
        <NuxtLink class="btn btn-primary" to="/">Open a PDF</NuxtLink>
      </div>
      <div v-else-if="editor.model" class="column">
        <PdfPage
          v-for="page in editor.pageOrder.map(i => editor.model!.pages[i]!)"
          :key="page.index"
          :page="page"
          :doc="pdfDoc"
          :doc-keys="docKeys"
          :zoom="editor.zoom"
          :rotation="editor.rotationOf(page.index)"
          :class="{ inert: editor.deleted }"
        />
      </div>
      <div v-else class="loading" role="status"><LoaderCircle class="spin" aria-hidden="true" />Opening your PDF…</div>
    </main>

    <SelectionCard v-if="editor.selection && !editor.deleted" :floating="!!cardPos" :pos="cardPos" />
    <PageRail v-if="editor.panel === 'pages'" :doc="pdfDoc" :floating="wide" @jump="jump" />
    <ChangeList v-if="editor.panel === 'changes'" :floating="wide" @jump="jump" />

    <div v-if="downloadState === 'done' || downloadState === 'error'" class="toast card" role="status">
      <template v-if="downloadState === 'done'">
        <Check class="ok" aria-hidden="true" />
        <p><strong>Downloaded {{ downloadedName }}</strong><span v-if="!editor.deleted"> The server copy is kept until {{ formatTime(editor.expiresAt) }}.</span></p>
        <button v-if="!editor.deleted" class="btn btn-soft" type="button" @click="deleteNow">Delete it now</button>
      </template>
      <template v-else>
        <p><strong>Download didn’t work.</strong> {{ downloadMessage }}</p>
        <button class="btn btn-soft" type="button" @click="download">Try again</button>
      </template>
      <button class="btn btn-icon" type="button" aria-label="Dismiss" @click="downloadState = 'idle'"><X /></button>
    </div>

    <nav class="bar card" aria-label="Editor">
      <button class="btn tool" type="button" :aria-pressed="editor.panel === 'pages'" :disabled="!editor.model" @click="togglePanel('pages')"><Files /><span>Pages</span></button>
      <button class="btn tool" type="button" :aria-pressed="editor.mode === 'addText'" :disabled="!editor.model || editor.deleted" @click="toggleAddText"><Type /><span>Add text</span></button>
      <span class="sep" aria-hidden="true" />
      <button class="btn tool" type="button" :disabled="!editor.past.length || editor.deleted" @click="editor.undo()"><Undo2 /><span>Undo</span></button>
      <button class="btn tool redo" type="button" :disabled="!editor.future.length || editor.deleted" @click="editor.redo()"><Redo2 /><span>Redo</span></button>
      <button class="btn tool" type="button" :aria-pressed="editor.panel === 'changes'" :disabled="!editor.model" @click="togglePanel('changes')">
        <span class="with-count"><ListChecks /><span v-if="changeCount" :key="changeCount" class="count num">{{ changeCount }}</span></span>
        <span>Changes</span>
      </button>
      <button class="btn btn-primary download" type="button" :disabled="!editor.model || editor.deleted || downloadState === 'working'" @click="download">
        <LoaderCircle v-if="downloadState === 'working'" class="spin" /><Download v-else />
        <span>{{ downloadState === 'working' ? 'Preparing…' : 'Download' }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.shell { height: 100dvh; display: grid; grid-template-rows: auto 1fr; overflow: hidden; }

.top {
  position: relative;
  z-index: 20;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3) 0;
  padding-top: max(var(--space-3), env(safe-area-inset-top));
}
.file {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  max-width: calc(100vw - 24px);
  flex: 1;
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  border-radius: 22px;
}
.file-nav { display: flex; align-items: center; gap: var(--space-1); flex: none; padding-right: var(--space-2); border-right: 1px solid var(--line); }
.new { padding: 0 var(--space-3); }

.confirm {
  position: fixed;
  top: 84px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 45;
  width: min(480px, calc(100vw - 24px));
  display: grid;
  gap: var(--space-2);
  padding: var(--space-5);
  box-shadow: var(--shadow-float);
  animation: drop 260ms var(--ease-out);
}
.confirm h2 { margin: 0; font-size: var(--text-lg); font-weight: 850; overflow-wrap: anywhere; }
.confirm p { margin: 0; color: var(--ink-2); font-size: var(--text-sm); line-height: 1.5; }
.confirm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-3); }
.upload-status { z-index: 46; }
.file-text { min-width: 0; flex: 1; }
.name { margin: 0; font-size: var(--text-sm); font-weight: 850; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { margin: 0; display: flex; flex-wrap: wrap; gap: 0 var(--space-3); color: var(--ink-2); font-size: var(--text-xs); }
.sync { display: inline-flex; align-items: center; gap: 4px; }
.sync .spin { width: 13px; height: 13px; }
.link { padding: 0; border: 0; background: none; color: var(--action); font-weight: 800; text-decoration: underline; text-underline-offset: 3px; }
.keep { display: flex; align-items: center; gap: var(--space-2); flex: none; }
.keep-text { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2); font-size: var(--text-xs); font-weight: 700; }
.keep-text svg { width: 16px; height: 16px; }
.deleted .keep-text { color: var(--ink); }
.zoom { display: flex; align-items: center; flex: none; padding-left: var(--space-2); border-left: 1px solid var(--line); }
.short { display: none; }
.zoom-value { min-width: 64px; padding: 0 var(--space-2); }

.hint {
  position: fixed;
  top: 84px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 22;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
  font-weight: 750;
  font-size: var(--text-sm);
  box-shadow: var(--shadow-float);
  animation: drop 300ms var(--ease-out);
  white-space: nowrap;
  max-width: calc(100vw - 24px);
}
.hint svg { width: 18px; height: 18px; color: var(--action); flex: none; }
.hint span { overflow: hidden; text-overflow: ellipsis; }
@keyframes drop { from { opacity: 0; transform: translate(-50%, -8px); } }

.stage {
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--space-5) var(--space-3) calc(var(--bar-height) + var(--space-7) + env(safe-area-inset-bottom));
  scroll-padding-top: var(--space-5);
  touch-action: pan-x pan-y;
}
.column { display: flex; flex-direction: column; align-items: center; gap: var(--space-6); min-width: min-content; margin: 0 auto; }
.with-rail .column { padding-left: 200px; }
.inert { pointer-events: none; opacity: 0.85; }
.loading, .gone { margin: 15vh auto 0; display: grid; justify-items: center; gap: var(--space-3); text-align: center; color: var(--ink-2); }
.gone { max-width: 440px; padding: var(--space-6) var(--space-5); color: var(--ink); }
.gone h2 { margin: 0; font-size: var(--text-lg); font-weight: 850; }
.gone p { margin: 0; color: var(--ink-2); }
.loading .spin { width: 32px; height: 32px; color: var(--action); }
.spin { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.bar {
  position: fixed;
  left: 50%;
  bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
  min-height: var(--bar-height);
  border-radius: 28px;
  box-shadow: var(--shadow-float);
  max-width: calc(100vw - 24px);
}
.sep { width: 1px; height: 28px; background: var(--line-strong); margin: 0 var(--space-1); }
.tool { padding: 0 var(--space-3); }
.download { margin-left: var(--space-2); min-height: 52px; }
.with-count { position: relative; display: inline-flex; margin-right: 6px; }
.count {
  position: absolute;
  top: -9px;
  right: -11px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 10px;
  background: var(--action);
  color: var(--on-action);
  font-size: 12px;
  font-weight: 850;
  line-height: 20px;
  text-align: center;
  box-shadow: 0 0 0 2px #fff;
  animation: bump 420ms var(--ease-out);
}
@keyframes bump { from { transform: scale(0.4); } }

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(var(--bar-height) + var(--space-5) + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 35;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: min(560px, calc(100vw - 24px));
  padding: var(--space-3) var(--space-2) var(--space-3) var(--space-4);
  box-shadow: var(--shadow-float);
  animation: up 320ms var(--ease-out);
}
.toast p { margin: 0; flex: 1; font-size: var(--text-sm); }
.toast .ok { flex: none; width: 22px; height: 22px; color: var(--action); stroke-width: 3; }
@keyframes up { from { opacity: 0; transform: translate(-50%, 12px); } }

@media (max-width: 720px) {
  .file { padding-left: var(--space-2); gap: var(--space-2); }
  .file-nav { gap: 2px; padding-right: var(--space-1); }
  .new { width: var(--tap); padding: 0; }
  .keep-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .bar { left: var(--space-2); right: var(--space-2); transform: none; justify-content: space-between; max-width: none; border-radius: 24px; }
  .tool { flex-direction: column; gap: 3px; padding: 0 2px; min-width: 50px; font-size: 13px; font-weight: 800; }
  .long { display: none; }
  .short { display: inline; }
  .keep .btn { padding: 0 var(--space-3); }
  .tool svg { width: 22px; height: 22px; }
  .sep, .redo { display: none; }
  .download { margin-left: 0; padding: 0 var(--space-4); }
  .toast { bottom: calc(var(--bar-height) + var(--space-4) + env(safe-area-inset-bottom)); }
}

</style>
