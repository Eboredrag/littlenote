<script setup lang="ts">
import type { Block, FallbackFamily, Point, Rect } from '#shared/types'
import { useEditor } from '~/stores/editor'
import { FAMILY_CSS, fontTitle, resolvedStyle, toHex } from '~/utils/style'

const props = defineProps<{
  block: Block
  page: number
  zoom: number
  stale: boolean
  paintedKey: string | null
  tabStop: boolean
}>()

const editor = useEditor()
const sampleBackground = inject<(r: Rect) => string>('sampleBackground', () => '#fff')

const op = computed(() => editor.opForBlock(props.block.id))
const style = computed(() => resolvedStyle(props.block, op.value?.style, editor.model?.fonts))
const text = computed(() => op.value?.text ?? props.block.text)
const report = computed(() => (op.value ? editor.reports[op.value.id] : undefined))
const selected = computed(() => editor.selection?.kind === 'block' && editor.selection.blockId === props.block.id)
const isEditing = computed(() => editor.editing === props.block.id)
const touchedInPaint = computed(() => !!props.paintedKey?.includes(`"${props.block.id}"`))
/** Draw our own copy of the text while the canvas still shows something else. */
const showPreview = computed(() => isEditing.value || (props.stale && (!!op.value || touchedInPaint.value)))
const changed = computed(() => !!op.value)
const removed = computed(() => !!op.value && !op.value.text.trim())

const font = computed(() => (props.block.style.fontKey ? editor.model?.fonts[props.block.style.fontKey] : undefined))

const hit = computed<Rect>(() => {
  const b = props.block.bbox
  const r = report.value?.bbox
  return r ? [Math.min(b[0], r[0]), Math.min(b[1], r[1]), Math.max(b[2], r[2]), Math.max(b[3], r[3])] : b
})

// --- Geometry of the inline editor (mirrors the server layout) --------------
const METRICS: Record<FallbackFamily, [number, number]> = { sans: [0.905, 0.212], serif: [0.891, 0.216], mono: [0.833, 0.3] }
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1]

const geometry = computed(() => {
  const lines = props.block.lines
  const first = lines[0]!
  const dir = first.dir
  const v: Point = [-dir[1], dir[0]]
  const o = first.origin
  const along = lines.flatMap(l => [[l.bbox[0], l.bbox[1]], [l.bbox[2], l.bbox[1]], [l.bbox[0], l.bbox[3]], [l.bbox[2], l.bbox[3]]] as Point[])
    .map(c => dot([c[0] - o[0], c[1] - o[1]], dir))
  const start = Math.min(0, ...along)
  const end = Math.max(...along)
  const scale = style.value.size / props.block.style.size
  const pitches = lines.slice(1).map((l, i) => dot([l.origin[0] - lines[i]!.origin[0], l.origin[1] - lines[i]!.origin[1]], v))
  const measured = pitches.length ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 0
  const pitch = (measured > props.block.style.size * 0.5 ? measured : props.block.style.size * 1.2) * scale
  const [asc, desc] = METRICS[style.value.family]
  const size = style.value.size
  const top = (pitch - (asc + desc) * size) / 2 + asc * size
  const x = o[0] + dir[0] * start - v[0] * top
  const y = o[1] + dir[1] * start - v[1] * top
  return { x, y, width: end - start, pitch, angle: Math.atan2(dir[1], dir[0]) * 180 / Math.PI, multi: lines.length > 1 }
})

const textCss = computed(() => {
  const z = props.zoom
  const g = geometry.value
  return {
    left: `${g.x * z}px`,
    top: `${g.y * z}px`,
    [g.multi ? 'width' : 'minWidth']: `${g.width * z}px`,
    transform: g.angle ? `rotate(${g.angle}deg)` : undefined,
    fontFamily: FAMILY_CSS[style.value.family],
    fontSize: `${style.value.size * z}px`,
    lineHeight: `${g.pitch * z}px`,
    fontWeight: style.value.bold ? 700 : 400,
    fontStyle: style.value.italic ? 'italic' : 'normal',
    color: toHex(style.value.color),
    textAlign: style.value.align,
    whiteSpace: g.multi ? 'pre-wrap' : 'pre',
  } as Record<string, string | number | undefined>
})

const rectCss = (r: Rect, pad = 0) => ({
  left: `${(r[0] - pad) * props.zoom}px`,
  top: `${(r[1] - pad) * props.zoom}px`,
  width: `${(r[2] - r[0] + pad * 2) * props.zoom}px`,
  height: `${(r[3] - r[1] + pad * 2) * props.zoom}px`,
})

const maskColor = ref('#fff')
watch(showPreview, (on) => { if (on) maskColor.value = sampleBackground(props.block.bbox) }, { immediate: true })

// --- Interaction -----------------------------------------------------------
const hitEl = ref<HTMLElement>()
const field = ref<HTMLElement>()

function select() {
  if (editor.deleted || editor.mode === 'addText') return
  if (selected.value && props.block.editable) return startEditing()
  editor.selection = { kind: 'block', page: props.page, blockId: props.block.id }
}

function startEditing() {
  if (!props.block.editable || editor.deleted) return
  editor.selection = { kind: 'block', page: props.page, blockId: props.block.id }
  editor.editing = props.block.id
}

watch(isEditing, async (on) => {
  if (!on) return
  await nextTick()
  const el = field.value
  if (!el) return
  el.textContent = text.value
  el.focus({ preventScroll: true })
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  keepVisible()
}, { flush: 'post' })

function keepVisible() {
  requestAnimationFrame(() => field.value?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }))
}

if (import.meta.client) {
  const vv = window.visualViewport
  const onResize = () => { if (isEditing.value) keepVisible() }
  vv?.addEventListener('resize', onResize)
  onScopeDispose(() => vv?.removeEventListener('resize', onResize))
}

let cancelled = false
function finish(save: boolean) {
  if (!isEditing.value) return
  cancelled = !save
  // Each line is its own field, so line breaks become spaces.
  const value = (field.value?.innerText ?? '').replace(/\r/g, '').replace(/\u00A0/g, ' ').replace(/\n+$/, '').replace(/\n/g, ' ')
  editor.editing = null
  if (save) editor.editBlockText(props.block, props.page, value)
  nextTick(() => hitEl.value?.focus({ preventScroll: true }))
}

function onFieldKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    finish(false)
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    finish(true)
  }
}

function onBlur() {
  if (!cancelled) finish(true)
  cancelled = false
}

function onPaste(e: ClipboardEvent) {
  // Keep pasted text plain in browsers without plaintext-only editing.
  e.preventDefault()
  document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '')
}

function onHitKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    select()
  }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.value && !removed.value) {
    e.preventDefault()
    editor.deleteBlock(props.block, props.page)
  }
  else if (e.key === 'Escape' && selected.value) {
    editor.selection = null
  }
}

const label = computed(() => {
  const shown = removed.value ? props.block.text : text.value
  const parts = [`“${shown.replace(/\n/g, ' ')}”`, `${fontTitle(font.value)}, ${style.value.size} point`]
  if (removed.value) parts.push('deleted')
  else if (changed.value) parts.push('changed')
  if (report.value?.substituted) parts.push('font substituted')
  if (!props.block.editable) parts.push(`read-only: ${props.block.readOnlyReason}`)
  return parts.join('. ')
})

const tabindex = computed(() => (selected.value || (props.tabStop && editor.selection?.page !== props.page) ? 0 : -1))
</script>

<template>
  <div
    v-if="showPreview"
    class="mask"
    :style="{ ...rectCss(block.bbox, 1.2), background: maskColor }"
    aria-hidden="true"
  />
  <div
    v-if="isEditing"
    ref="field"
    class="field"
    :style="textCss"
    contenteditable="plaintext-only"
    role="textbox"
    :aria-multiline="geometry.multi"
    :aria-label="`Edit text on page ${page + 1}`"
    spellcheck="true"
    @keydown="onFieldKey"
    @blur="onBlur"
    @paste="onPaste"
  />
  <div v-else-if="showPreview" class="preview" :style="textCss" aria-hidden="true">{{ text }}</div>
  <div
    v-show="!isEditing"
    ref="hitEl"
    class="hit"
    :class="{ selected, changed, removed, readonly: !block.editable, swapped: report?.substituted && !removed }"
    :style="rectCss(hit, 2)"
    :data-block="block.id"
    role="button"
    :tabindex="tabindex"
    :aria-pressed="selected"
    :aria-label="label"
    :aria-keyshortcuts="selected && block.editable ? 'Enter Delete' : undefined"
    @click.stop="select"
    @dblclick.stop="startEditing"
    @keydown="onHitKey"
  >
    <span v-if="changed" class="mark" aria-hidden="true" />
  </div>
</template>

<style scoped>
.hit {
  position: absolute;
  scroll-margin-top: 96px;
  border-radius: 6px;
  cursor: text;
  transition: background-color 140ms ease, box-shadow 200ms ease;
}
.hit.readonly { cursor: default; }
/* A deleted field keeps a faint dashed outline so it can be found and restored. */
.hit.removed { outline: 1.5px dashed var(--ink-3); outline-offset: -1px; cursor: pointer; }
.hit:hover { background: var(--action-tint); }
.hit.readonly:hover { background: rgb(43 29 22 / 0.06); }
/* Selected: the outline lifts off the page on a soft shadow; pressing it gives a soft spring. */
.hit.selected {
  background: var(--action-tint);
  box-shadow: 0 0 0 2px var(--action), 0 10px 22px -8px rgb(59 52 230 / 0.45);
  animation: lift 340ms var(--ease-out);
  transition: transform 260ms var(--spring), box-shadow 200ms ease;
}
.hit.selected:active { transform: scale(0.98); box-shadow: 0 0 0 2px var(--action), 0 3px 8px -4px rgb(59 52 230 / 0.4); }
.hit.readonly.selected { box-shadow: 0 0 0 2px var(--ink-2); background: rgb(43 29 22 / 0.06); }
.hit:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--action), 0 0 0 6px rgb(255 255 255 / 0.9); }
@keyframes lift { from { box-shadow: 0 0 0 2px var(--action), 0 0 0 -8px rgb(59 52 230 / 0); } }

/* Changed marker: status, so ink rather than the action colour. A swapped font turns it into a diamond. */
.mark {
  position: absolute;
  top: -5px;
  left: -5px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--ink-2);
  box-shadow: 0 0 0 2px #fff;
}
.swapped .mark { border-radius: 2px; transform: rotate(45deg); background: #fff; box-shadow: 0 0 0 2.5px var(--ink-2), 0 0 0 4.5px #fff; }

.mask { position: absolute; border-radius: 2px; pointer-events: none; }
.preview, .field {
  position: absolute;
  margin: 0;
  padding: 0;
  transform-origin: 0 0;
  font-synthesis: none;
  font-kerning: normal;
  -webkit-font-smoothing: auto;
}
.preview { pointer-events: none; }
.field {
  outline: none;
  border-radius: 2px;
  box-shadow: 0 0 0 2px var(--action), 0 0 0 6px var(--action-tint-strong);
  caret-color: var(--action);
  cursor: text;
  z-index: 2;
}
</style>
