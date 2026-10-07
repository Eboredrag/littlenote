<script setup lang="ts">
import { Info, Pencil, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-vue-next'
import type { AddTextOp, Align, FallbackFamily, RGB } from '#shared/types'
import { useEditor } from '~/stores/editor'
import { colorName, fileFontOptions, fontTitle, resolvedStyle, toHex } from '~/utils/style'

defineProps<{ floating: boolean, pos?: { top: number, left: number, maxHeight: number } }>()

const editor = useEditor()
const showStyle = ref(false)

const sel = computed(() => editor.selection)
const block = computed(() => (sel.value?.kind === 'block' ? editor.blockById(sel.value.page, sel.value.blockId) : undefined))
const added = computed(() => {
  const s = sel.value
  return s?.kind === 'added' ? editor.ops.find((o): o is AddTextOp => o.id === s.opId && o.type === 'addText') : undefined
})
const op = computed(() => (block.value ? editor.opForBlock(block.value.id) : added.value))
const report = computed(() => (op.value ? editor.reports[op.value.id] : undefined))
/** The selected field's text has been deleted (an edit with no text). */
const isDeleted = computed(() => !!block.value && op.value?.type === 'editBlock' && !op.value.text.trim())
const font = computed(() => (block.value?.style.fontKey ? editor.model?.fonts[block.value.style.fontKey] : undefined))
const style = computed(() => (block.value ? resolvedStyle(block.value, editor.opForBlock(block.value.id)?.style, editor.model?.fonts) : undefined))

/** Fonts from this file for the picker, and which option is currently in use. */
const fileFonts = computed(() => (editor.model && sel.value
  ? fileFontOptions(editor.model.fonts, editor.model.pages, sel.value.page, block.value?.style.fontKey)
  : []))
const fontValue = computed(() => {
  if (block.value && style.value) return style.value.choice === 'original' ? `file:${style.value.fontKey}` : style.value.choice
  if (added.value) return added.value.style.fontKey ? `file:${added.value.style.fontKey}` : added.value.style.font
  return ''
})

function pickFont(value: string) {
  const key = value.startsWith('file:') ? value.slice(5) : undefined
  const info = key ? editor.model?.fonts[key] : undefined
  if (block.value && sel.value) {
    if (key === block.value.style.fontKey) editor.styleBlock(block.value, sel.value.page, { font: undefined, fontKey: undefined, bold: undefined, italic: undefined })
    else if (info) editor.styleBlock(block.value, sel.value.page, { font: undefined, fontKey: info.key, bold: info.bold, italic: info.italic })
    else editor.styleBlock(block.value, sel.value.page, { font: value as FallbackFamily, fontKey: undefined })
  }
  else if (added.value) {
    editor.updateAdded(added.value.id, {
      style: info
        ? { fontKey: info.key, font: info.fallback, bold: info.bold, italic: info.italic }
        : { fontKey: undefined, font: value as FallbackFamily },
    })
  }
}

/** Distinct fonts used inside the selected block. */
const runFonts = computed(() => {
  if (!block.value) return []
  const keys = [...new Set(block.value.lines.flatMap(l => l.runs.map(r => r.fontKey)))]
  return keys.map(k => editor.model?.fonts[k]).filter(Boolean)
})

const badges = computed(() => {
  const f = font.value
  if (!f) return []
  const list: { label: string, hint: string }[] = []
  list.push(f.embedded
    ? { label: 'Embedded', hint: 'The font is stored inside this PDF.' }
    : { label: 'Not embedded', hint: 'The PDF only names this font; viewers use their own copy.' })
  if (f.subset) list.push({ label: 'Subset', hint: 'Only the letters this document uses are stored.' })
  if (f.program || f.type !== 'Unknown') list.push({ label: f.program ?? f.type, hint: 'Font format' })
  return list
})

watch(() => sel.value && JSON.stringify(sel.value), () => { showStyle.value = !!added.value }, { immediate: true })

function changeStyle(patch: { size?: number, bold?: boolean, italic?: boolean, color?: RGB, align?: Align }) {
  if (block.value && sel.value) editor.styleBlock(block.value, sel.value.page, patch)
  else if (added.value) editor.updateAdded(added.value.id, { style: patch })
}

function edit() {
  if (block.value) editor.editing = block.value.id
  else if (added.value) editor.editing = added.value.id
}

function close() {
  editor.selection = null
}

// Show a scroll edge above the actions when the card's content overflows.
const root = ref<HTMLElement>()
const scrolls = ref(false)
function measure() {
  const el = root.value
  scrolls.value = !!el && el.scrollHeight - el.scrollTop - el.clientHeight > 2
}
let ro: ResizeObserver | undefined
watch(root, (el) => {
  ro?.disconnect()
  if (!el) return
  ro = new ResizeObserver(measure)
  ro.observe(el)
  if (el.firstElementChild) ro.observe(el.firstElementChild)
  measure()
})
watch(showStyle, () => nextTick(measure))
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <section
    v-if="block || added"
    ref="root"
    class="sel card"
    :class="[floating ? 'float' : 'sheet', { scrolls }]"
    :style="floating && pos ? { top: `${pos.top}px`, left: `${pos.left}px`, maxHeight: `${pos.maxHeight}px` } : undefined"
    aria-label="Selected text"
    @keydown.esc="close"
    @scroll.passive="measure"
  >
    <header class="head">
      <div class="title">
        <h2>{{ block ? fontTitle(font) : 'New text' }}</h2>
        <p v-if="block && font" class="raw" :title="font.rawName">{{ font.rawName }}</p>
      </div>
      <button class="btn btn-icon" type="button" aria-label="Close" @click="close"><X /></button>
    </header>

    <ul v-if="badges.length" class="badges">
      <li v-for="b in badges" :key="b.label" :title="b.hint">{{ b.label }}</li>
    </ul>

    <dl v-if="style" class="facts">
      <div><dt>Size</dt><dd class="num">{{ style.size }} pt</dd></div>
      <div><dt>Colour</dt><dd><span class="dot" :style="{ background: toHex(style.color) }" aria-hidden="true" />{{ colorName(style.color) }}</dd></div>
    </dl>

    <p v-if="isDeleted" class="note" role="status">
      <Info aria-hidden="true" />This text is deleted. It won’t be in the PDF you download.
    </p>
    <p v-if="block && !block.editable" class="note">
      <Info aria-hidden="true" />{{ block.readOnlyReason }}
    </p>
    <p v-else-if="block?.mixed" class="note">
      <Info aria-hidden="true" />
      <span>This text mixes {{ runFonts.length > 1 ? `${runFonts.length} fonts` : 'styles' }}. Editing it sets all of it in {{ fontTitle(font) }}.</span>
    </p>
    <p v-if="report?.substituted && !isDeleted" class="note swap" role="status">
      <Info aria-hidden="true" /><span>{{ report.reason }}.</span>
    </p>
    <p v-else-if="report && op && !editor.deleted && !isDeleted && report.fontUsed" class="note ok">
      Written with {{ report.fontUsed }}.
    </p>

    <div v-if="showStyle && !isDeleted && (added || block?.editable)" class="style">
      <StyleControls
        v-if="block && style"
        :file-fonts="fileFonts"
        :font-value="fontValue"
        :original-color="block.style.color"
        :size="style.size"
        :bold="style.bold"
        :italic="style.italic"
        :color="style.color"
        :align="style.align"
        @change="changeStyle"
        @font="pickFont"
      />
      <StyleControls
        v-else-if="added"
        :file-fonts="fileFonts"
        :font-value="fontValue"
        :size="added.style.size"
        :bold="added.style.bold"
        :italic="added.style.italic"
        :color="added.style.color"
        :align="added.style.align"
        @change="changeStyle"
        @font="pickFont"
      />
    </div>

    <footer v-if="!editor.deleted && (added || block?.editable)" class="actions">
      <template v-if="isDeleted && block">
        <button class="btn btn-primary" type="button" @click="editor.revertBlock(block.id)"><RotateCcw />Restore original</button>
      </template>
      <template v-else>
        <button class="btn btn-primary" type="button" @click="edit"><Pencil />Edit text</button>
        <button v-if="block" class="btn btn-soft" type="button" :aria-expanded="showStyle" @click="showStyle = !showStyle"><SlidersHorizontal />Style</button>
        <button v-if="block && op" class="btn" type="button" @click="editor.revertBlock(block.id)"><RotateCcw />Restore original</button>
        <button
          class="btn"
          type="button"
          aria-keyshortcuts="Delete Backspace"
          title="Delete text (Delete key)"
          @click="block && sel ? editor.deleteBlock(block, sel.page) : added && editor.removeOp(added.id)"
        >
          <Trash2 />Delete text
        </button>
      </template>
    </footer>
  </section>
</template>

<style scoped>
.sel {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) 0 var(--space-5);
  z-index: 30;
}
.float {
  position: fixed;
  width: 340px;
  overflow: auto;
  overscroll-behavior: contain;
  box-shadow: var(--shadow-float);
  animation: rise 300ms var(--ease-out);
}
.sheet {
  position: fixed;
  left: var(--space-3);
  right: var(--space-3);
  bottom: calc(var(--bar-height) + var(--space-3) + env(safe-area-inset-bottom));
  max-height: min(60dvh, 520px);
  overflow: auto;
  box-shadow: var(--shadow-float);
  animation: up 320ms var(--ease-out);
  overscroll-behavior: contain;
}
@keyframes rise { from { opacity: 0; transform: translateY(6px) scale(0.98); } }
@keyframes up { from { opacity: 0; transform: translateY(24px); } }

.head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); }
.title { min-width: 0; padding-top: var(--space-2); }
h2 { margin: 0; font-size: var(--text-lg); font-weight: 850; line-height: 1.2; letter-spacing: -0.01em; overflow-wrap: anywhere; }
.raw { margin: 2px 0 0; color: var(--ink-3); font-size: var(--text-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.badges { display: flex; flex-wrap: wrap; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
.badges li {
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: var(--card-sunk);
  color: var(--ink-2);
  font-size: var(--text-xs);
  font-weight: 750;
  cursor: help;
}

.facts { display: flex; gap: var(--space-5); margin: 0; }
.facts div { display: grid; gap: 2px; }
dt { font-size: var(--text-xs); font-weight: 800; color: var(--ink-3); }
dd { margin: 0; font-weight: 750; display: flex; align-items: center; gap: 6px; }
.dot { width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgb(43 29 22 / 0.2); }

.note {
  display: flex;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-control);
  background: var(--card-sunk);
  color: var(--ink);
  font-size: var(--text-sm);
  line-height: 1.45;
}
.note svg { flex: none; width: 18px; height: 18px; margin-top: 2px; color: var(--ink-2); }
.note.swap { box-shadow: inset 0 0 0 2px var(--ground-deep); }
.note.ok { padding: 0; background: none; color: var(--ink-2); }

.style { padding-top: var(--space-2); border-top: 1px solid var(--line); }
/* The actions stay in reach while the style controls scroll beneath them. */
.actions {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0 calc(-1 * var(--space-4)) 0 calc(-1 * var(--space-5));
  padding: var(--space-3) var(--space-4) var(--space-4) var(--space-5);
  background: var(--card);
  border-radius: 0 0 var(--radius-card) var(--radius-card);
}
.sel.scrolls .actions { box-shadow: 0 -10px 14px -10px rgb(73 35 14 / 0.28); border-top: 1px solid var(--line); }
.sel > :last-child:not(.actions) { margin-bottom: var(--space-4); }
</style>
