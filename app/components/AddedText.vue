<script setup lang="ts">
import type { AddTextOp, FallbackFamily } from '#shared/types'
import { useEditor } from '~/stores/editor'
import { FAMILY_CSS, toHex } from '~/utils/style'

const props = defineProps<{ opId: string, zoom: number, stale: boolean }>()
const editor = useEditor()

const op = computed(() => editor.ops.find((o): o is AddTextOp => o.id === props.opId && o.type === 'addText'))
const selected = computed(() => editor.selection?.kind === 'added' && editor.selection.opId === props.opId)
const isEditing = computed(() => editor.editing === props.opId)

const METRICS: Record<FallbackFamily, [number, number]> = { sans: [0.905, 0.212], serif: [0.891, 0.216], mono: [0.833, 0.3] }

const drag = reactive({ active: false, moved: false, dx: 0, dy: 0, sx: 0, sy: 0 })

const css = computed(() => {
  const o = op.value!
  const s = o.style
  const z = props.zoom
  const [asc, desc] = METRICS[s.font]
  const line = s.size * 1.2
  const top = o.y + s.size * 0.8 - ((line - (asc + desc) * s.size) / 2 + asc * s.size)
  return {
    left: `${o.x * z + drag.dx}px`,
    top: `${top * z + drag.dy}px`,
    width: `${o.width * z}px`,
    fontFamily: FAMILY_CSS[s.font],
    fontSize: `${s.size * z}px`,
    lineHeight: `${line * z}px`,
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? 'italic' : 'normal',
    color: toHex(s.color),
    textAlign: s.align,
  }
})

const field = ref<HTMLElement>()
const box = ref<HTMLElement>()

watch(isEditing, async (on) => {
  if (!on) return
  await nextTick()
  const el = field.value
  if (!el) return
  el.textContent = op.value?.text ?? ''
  el.focus({ preventScroll: true })
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}, { immediate: true, flush: 'post' })

let cancelled = false
function finish(save: boolean) {
  if (!isEditing.value) return
  cancelled = !save
  const value = (field.value?.innerText ?? '').replace(/\r/g, '').replace(/ /g, ' ').replace(/\n$/, '')
  editor.editing = null
  if (save && value.trim()) editor.updateAdded(props.opId, { text: value })
  else if (!op.value?.text.trim()) editor.pruneEmptyAdded(props.opId)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    finish(false)
  }
  else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    finish(true)
  }
}

function onBlur() {
  if (!cancelled) finish(true)
  cancelled = false
}

function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '')
}

// Selecting, dragging to move, and keyboard nudging.
function onPointerDown(e: PointerEvent) {
  if (editor.deleted) return
  if (!selected.value) {
    editor.selection = { kind: 'added', page: op.value!.page, opId: props.opId }
    return
  }
  Object.assign(drag, { active: true, moved: false, dx: 0, dy: 0, sx: e.clientX, sy: e.clientY })
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!drag.active) return
  drag.dx = e.clientX - drag.sx
  drag.dy = e.clientY - drag.sy
  if (Math.hypot(drag.dx, drag.dy) > 4) drag.moved = true
}

function onPointerUp() {
  if (!drag.active) return
  const o = op.value!
  if (drag.moved) editor.updateAdded(props.opId, { x: o.x + drag.dx / props.zoom, y: o.y + drag.dy / props.zoom })
  else editor.editing = props.opId
  Object.assign(drag, { active: false, moved: false, dx: 0, dy: 0 })
}

function onBoxKey(e: KeyboardEvent) {
  const o = op.value!
  const step = e.shiftKey ? 10 : 1
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  if (moves[e.key]) {
    e.preventDefault()
    e.stopPropagation()
    if (!selected.value) editor.selection = { kind: 'added', page: o.page, opId: props.opId }
    else editor.updateAdded(props.opId, { x: o.x + moves[e.key]![0], y: o.y + moves[e.key]![1] })
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    editor.selection = { kind: 'added', page: o.page, opId: props.opId }
    editor.editing = props.opId
  }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.value) {
    e.preventDefault()
    editor.removeOp(props.opId)
  }
  else if (e.key === 'Escape') editor.selection = null
}
</script>

<template>
  <template v-if="op">
    <div
      v-if="isEditing"
      ref="field"
      class="text field"
      :style="css"
      contenteditable="plaintext-only"
      role="textbox"
      aria-multiline="true"
      :aria-label="`New text on page ${op.page + 1}`"
      @keydown="onKey"
      @blur="onBlur"
      @paste="onPaste"
      @click.stop
    />
    <div
      v-else
      ref="box"
      class="text box"
      :class="{ selected, ghost: !stale && !drag.active, dragging: drag.active && drag.moved }"
      :style="css"
      data-block
      role="button"
      tabindex="0"
      :aria-pressed="selected"
      :aria-label="`Added text: “${op.text}”. Arrow keys move it, Enter edits.`"
      @click.stop
      @pointerdown.stop="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onBoxKey"
    >{{ op.text || ' ' }}</div>
  </template>
</template>

<style scoped>
.text {
  position: absolute;
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  font-synthesis: none;
  border-radius: 3px;
  touch-action: none;
}
.box { cursor: pointer; transition: box-shadow 200ms ease, background-color 140ms ease; }
.box.ghost { color: transparent !important; }
.box:hover { background: var(--action-tint); }
.box.selected { cursor: grab; background: var(--action-tint); box-shadow: 0 0 0 2px var(--action); }
.box.dragging { cursor: grabbing; color: inherit; box-shadow: var(--shadow-float), 0 0 0 2px var(--action); }
.box:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--action), 0 0 0 6px rgb(255 255 255 / 0.9); }
.field { outline: none; box-shadow: 0 0 0 2px var(--action), 0 0 0 6px var(--action-tint-strong); caret-color: var(--action); min-height: 1.2em; z-index: 2; background: rgb(255 255 255 / 0.6); }
</style>
