<script setup lang="ts">
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PageModel, Rect } from '#shared/types'
import { useEditor } from '~/stores/editor'

const props = defineProps<{
  page: PageModel
  doc: PDFDocumentProxy | null
  /** Edit key per page that `doc` was rendered with. */
  docKeys: Record<number, string>
  zoom: number
  rotation: number
}>()

const editor = useEditor()
const root = ref<HTMLElement>()
const canvas = ref<HTMLCanvasElement>()
const visible = ref(false)
const paintedKey = ref<string | null>(null)
const painting = ref(false)
let token = 0

const w = computed(() => props.page.width * props.zoom)
const h = computed(() => props.page.height * props.zoom)
const quarter = computed(() => props.rotation === 90 || props.rotation === 270)

/** The canvas no longer matches the edit list for this page. */
const stale = computed(() => paintedKey.value !== editor.pageKey(props.page.index))
const editsOnPage = computed(() => editor.ops.filter(o => (o.type === 'editBlock' || o.type === 'addText') && o.page === props.page.index))

async function paint() {
  const doc = props.doc
  if (!visible.value || !doc || !canvas.value) return
  const mine = ++token
  painting.value = true
  try {
    const pdfPage = await doc.getPage(props.page.index + 1)
    const viewport = pdfPage.getViewport({ scale: props.zoom })
    const maxRatio = Math.sqrt(16_000_000 / Math.max(1, viewport.width * viewport.height))
    const ratio = Math.min(window.devicePixelRatio || 1, 2.5, maxRatio)
    const off = document.createElement('canvas')
    off.width = Math.floor(viewport.width * ratio)
    off.height = Math.floor(viewport.height * ratio)
    await pdfPage.render({ canvas: off, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined }).promise
    if (mine !== token || !canvas.value) return
    canvas.value.width = off.width
    canvas.value.height = off.height
    canvas.value.getContext('2d')!.drawImage(off, 0, 0)
    paintedKey.value = props.docKeys[props.page.index] ?? editor.pageKey(props.page.index, [])
  }
  catch (err) {
    if ((err as Error)?.name !== 'RenderingCancelledException') console.warn('page render failed', err)
  }
  finally {
    if (mine === token) painting.value = false
  }
}

/** Most common colour around a rectangle, used to hide old text while typing. */
function sampleBackground(rect: Rect): string {
  const c = canvas.value
  if (!c?.width) return '#ffffff'
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const sx = c.width / props.page.width
  const sy = c.height / props.page.height
  const pad = 2
  const pts: [number, number][] = [
    [rect[0] - pad, rect[1] - pad], [rect[2] + pad, rect[1] - pad], [rect[0] - pad, rect[3] + pad], [rect[2] + pad, rect[3] + pad],
    [(rect[0] + rect[2]) / 2, rect[1] - pad], [(rect[0] + rect[2]) / 2, rect[3] + pad], [rect[0] - pad, (rect[1] + rect[3]) / 2], [rect[2] + pad, (rect[1] + rect[3]) / 2],
  ]
  const counts = new Map<string, number>()
  for (const [x, y] of pts) {
    const px = Math.min(c.width - 1, Math.max(0, Math.round(x * sx)))
    const py = Math.min(c.height - 1, Math.max(0, Math.round(y * sy)))
    const [r, g, b] = ctx.getImageData(px, py, 1, 1).data
    const key = `rgb(${r} ${g} ${b})`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#ffffff'
}

provide('sampleBackground', sampleBackground)

watch(() => [props.doc, props.zoom, visible.value], paint)

let observer: IntersectionObserver | undefined
onMounted(() => {
  observer = new IntersectionObserver(([entry]) => { visible.value = !!entry?.isIntersecting }, { rootMargin: '600px 0px' })
  observer.observe(root.value!)
})
onBeforeUnmount(() => observer?.disconnect())

// --- Keyboard: roving focus between text blocks -----------------------------
const overlay = ref<HTMLElement>()
function onKey(e: KeyboardEvent) {
  if (editor.editing) return
  const items = [...(overlay.value?.querySelectorAll<HTMLElement>('[data-block]') ?? [])]
  const at = items.indexOf(document.activeElement as HTMLElement)
  if (at < 0) return
  const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
  if (!delta) return
  e.preventDefault()
  items[Math.min(items.length - 1, Math.max(0, at + delta))]?.focus()
}

function onPageClick(e: MouseEvent) {
  if (editor.mode !== 'addText' || editor.deleted) return
  e.stopPropagation()
  const target = e.currentTarget as HTMLElement
  const box = target.getBoundingClientRect()
  // offsetX/Y are in the page's own (unrotated) coordinates.
  const x = (e.target === target || e.target === canvas.value) ? e.offsetX : e.clientX - box.left
  const y = (e.target === target || e.target === canvas.value) ? e.offsetY : e.clientY - box.top
  editor.addTextAt(props.page.index, x / props.zoom, y / props.zoom)
}

defineExpose({ root })
</script>

<template>
  <div
    ref="root"
    class="slot"
    :data-page="page.index"
    :style="{ width: `${quarter ? h : w}px`, height: `${quarter ? w : h}px` }"
  >
    <div
      class="paper"
      :class="{ adding: editor.mode === 'addText' }"
      :style="{ width: `${w}px`, height: `${h}px`, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }"
      @click="onPageClick"
    >
      <canvas ref="canvas" class="canvas" :style="{ width: `${w}px`, height: `${h}px` }" aria-hidden="true" />
      <div
        ref="overlay"
        class="overlay"
        role="group"
        :aria-label="`Page ${page.index + 1} text`"
        @keydown="onKey"
      >
        <TextBlock
          v-for="(block, i) in page.blocks"
          :key="block.id"
          :block="block"
          :page="page.index"
          :zoom="zoom"
          :stale="stale"
          :painted-key="paintedKey"
          :tab-stop="i === 0"
        />
        <AddedText
          v-for="op in editsOnPage.filter(o => o.type === 'addText')"
          :key="op.id"
          :op-id="op.id"
          :zoom="zoom"
          :stale="stale"
        />
      </div>
      <div v-if="!paintedKey" class="placeholder" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.slot { position: relative; flex: none; }
.paper {
  position: absolute;
  left: 50%;
  top: 50%;
  background: #fff;
  border-radius: 4px;
  box-shadow: var(--shadow-page);
  transition: transform 320ms var(--ease-out);
}
.paper.adding { cursor: crosshair; }
.canvas { display: block; border-radius: 4px; }
.overlay { position: absolute; inset: 0; }
.placeholder {
  position: absolute;
  inset: 0;
  border-radius: 4px;
  background: linear-gradient(100deg, #fff 30%, var(--card-sunk) 50%, #fff 70%) 0 0 / 300% 100%;
  animation: shimmer 1.4s linear infinite;
}
@keyframes shimmer { to { background-position: -150% 0; } }
</style>
