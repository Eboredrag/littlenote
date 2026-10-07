<script setup lang="ts">
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ArrowDown, ArrowUp, RotateCw, Trash2, X } from 'lucide-vue-next'
import { useEditor } from '~/stores/editor'

defineProps<{ doc: PDFDocumentProxy | null, floating: boolean }>()
const emit = defineEmits<{ jump: [page: number] }>()

const editor = useEditor()
const dragFrom = ref<number | null>(null)
const dragOver = ref<number | null>(null)

function onDrop(target: number) {
  const from = dragFrom.value
  dragFrom.value = dragOver.value = null
  if (from === null || from === target) return
  const order = editor.pageOrder.filter(p => p !== from)
  order.splice(order.indexOf(target) + (editor.pageOrder.indexOf(from) < editor.pageOrder.indexOf(target) ? 1 : 0), 0, from)
  editor.setOrder(order, `Moved page ${from + 1} to position ${order.indexOf(from) + 1}`)
}
</script>

<template>
  <section class="rail card" :class="floating ? 'float' : 'sheet'" aria-labelledby="rail-title" @keydown.esc="editor.panel = null">
    <header class="head">
      <h2 id="rail-title">Pages <span class="num count">{{ editor.pageOrder.length }}</span></h2>
      <button class="btn btn-icon" type="button" aria-label="Close pages" @click="editor.panel = null"><X /></button>
    </header>
    <ol class="list">
      <li
        v-for="(page, pos) in editor.pageOrder"
        :key="page"
        class="item"
        :class="{ over: dragOver === page && dragFrom !== page, lifting: dragFrom === page }"
        :draggable="floating && !editor.deleted"
        @dragstart="dragFrom = page"
        @dragover.prevent="dragOver = page"
        @dragleave="dragOver = dragOver === page ? null : dragOver"
        @drop.prevent="onDrop(page)"
        @dragend="dragFrom = dragOver = null"
      >
        <button class="jump" type="button" :aria-label="`Go to page ${pos + 1}${page !== pos ? `, originally page ${page + 1}` : ''}`" @click="emit('jump', page)">
          <PdfThumb :doc="doc" :index="page" :rotation="editor.rotationOf(page)" :width="floating ? 112 : 96" />
          <span class="name num">{{ pos + 1 }}<small v-if="page !== pos"> · was {{ page + 1 }}</small></span>
        </button>
        <div v-if="!editor.deleted" class="tools" role="group" :aria-label="`Page ${pos + 1} actions`">
          <button class="btn btn-icon" type="button" :disabled="pos === 0" :aria-label="`Move page ${pos + 1} up`" @click="editor.movePage(page, -1)"><ArrowUp /></button>
          <button class="btn btn-icon" type="button" :disabled="pos === editor.pageOrder.length - 1" :aria-label="`Move page ${pos + 1} down`" @click="editor.movePage(page, 1)"><ArrowDown /></button>
          <button class="btn btn-icon" type="button" :aria-label="`Rotate page ${pos + 1}`" @click="editor.rotatePage(page)"><RotateCw /></button>
          <button class="btn btn-icon" type="button" :disabled="editor.pageOrder.length <= 1" :aria-label="`Delete page ${pos + 1}`" @click="editor.deletePage(page)"><Trash2 /></button>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.rail { display: grid; grid-template-rows: auto 1fr; z-index: 25; overflow: hidden; }
.float {
  position: fixed;
  left: var(--space-4);
  top: 88px;
  bottom: calc(var(--bar-height) + var(--space-5));
  width: 212px;
  animation: slide 300ms var(--ease-out);
}
.sheet {
  position: fixed;
  left: var(--space-3);
  right: var(--space-3);
  bottom: calc(var(--bar-height) + var(--space-3) + env(safe-area-inset-bottom));
  max-height: min(62dvh, 560px);
  box-shadow: var(--shadow-float);
  animation: up 320ms var(--ease-out);
}
@keyframes slide { from { opacity: 0; transform: translateX(-12px); } }
@keyframes up { from { opacity: 0; transform: translateY(24px); } }

.head { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-2) var(--space-2) var(--space-4); }
h2 { margin: 0; font-size: var(--text-md); font-weight: 850; display: flex; align-items: center; gap: var(--space-2); }
.count { padding: 1px 9px; border-radius: var(--radius-pill); background: var(--card-sunk); font-size: var(--text-xs); color: var(--ink-2); }

.list { margin: 0; padding: 0 var(--space-3) var(--space-4); list-style: none; overflow: auto; overscroll-behavior: contain; display: grid; align-content: start; gap: var(--space-2); }
.sheet .list { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.item { display: grid; justify-items: center; gap: var(--space-1); padding: var(--space-2); border-radius: 16px; transition: background-color 160ms ease, transform 220ms var(--spring); }
.item.over { background: var(--action-tint); }
.item.lifting { opacity: 0.5; }
.jump { display: grid; justify-items: center; gap: var(--space-2); padding: var(--space-2); border: 0; background: none; border-radius: 12px; }
.jump:hover { background: var(--card-sunk); }
.name { font-weight: 800; font-size: var(--text-sm); }
.name small { font-weight: 700; color: var(--ink-3); }
.tools { display: flex; gap: 0; }
.tools .btn { width: 40px; min-width: 40px; }
.tools .btn svg { width: 18px; height: 18px; }
@media (pointer: coarse) { .tools .btn { width: var(--tap); min-width: var(--tap); } }
</style>
