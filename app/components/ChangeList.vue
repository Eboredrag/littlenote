<script setup lang="ts">
import { Info, Undo2, X } from 'lucide-vue-next'
import { useEditor } from '~/stores/editor'

defineProps<{ floating: boolean }>()
const emit = defineEmits<{ jump: [page: number] }>()
const editor = useEditor()
</script>

<template>
  <section class="changes card" :class="floating ? 'float' : 'sheet'" aria-labelledby="changes-title" @keydown.esc="editor.panel = null">
    <header class="head">
      <h2 id="changes-title">Your changes <span class="num count">{{ editor.changes.length }}</span></h2>
      <button class="btn btn-icon" type="button" aria-label="Close changes" @click="editor.panel = null"><X /></button>
    </header>
    <p v-if="!editor.changes.length" class="empty">
      Nothing changed yet. Tap any text on the page to change it, or use Pages to rotate, reorder or delete pages.
    </p>
    <ol v-else class="list">
      <li v-for="c in editor.changes" :key="c.id" class="row">
        <button class="what" type="button" :disabled="c.page === undefined" @click="c.page !== undefined && emit('jump', c.page)">
          <span class="label">{{ c.label }}</span>
          <span v-if="c.detail" class="detail">{{ c.detail }}</span>
          <span v-if="c.warning" class="warn"><Info aria-hidden="true" />{{ c.warning }}.</span>
        </button>
        <button v-if="!editor.deleted" class="btn btn-soft undo" type="button" :aria-label="`Undo: ${c.label}`" @click="editor.removeOp(c.id)"><Undo2 />Undo</button>
      </li>
    </ol>
    <SourceNotice class="notice" />
  </section>
</template>

<style scoped>
.changes { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; z-index: 26; overflow: hidden; }
.notice { padding: var(--space-2) var(--space-5) var(--space-4); border-top: 1px solid var(--line); }
.float {
  position: fixed;
  right: var(--space-4);
  bottom: calc(var(--bar-height) + var(--space-5));
  width: 380px;
  max-height: min(60dvh, 560px);
  box-shadow: var(--shadow-float);
  animation: up 300ms var(--ease-out);
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
@keyframes up { from { opacity: 0; transform: translateY(20px); } }
.head { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-2) var(--space-2) var(--space-5); }
h2 { margin: 0; font-size: var(--text-md); font-weight: 850; display: flex; align-items: center; gap: var(--space-2); }
.count { padding: 1px 9px; border-radius: var(--radius-pill); background: var(--card-sunk); font-size: var(--text-xs); color: var(--ink-2); }
.empty { margin: 0; padding: 0 var(--space-5) var(--space-5); color: var(--ink-2); font-size: var(--text-sm); }
.list { margin: 0; padding: 0 var(--space-3) var(--space-3); list-style: none; overflow: auto; overscroll-behavior: contain; }
.row { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) 0; }
.row + .row { border-top: 1px solid var(--line); }
.what { flex: 1; min-width: 0; display: grid; gap: 2px; padding: var(--space-2); border: 0; background: none; text-align: left; border-radius: 12px; }
.what:not(:disabled):hover { background: var(--card-sunk); }
.what:disabled { cursor: default; color: inherit; }
.label { font-weight: 750; font-size: var(--text-sm); overflow-wrap: anywhere; }
.detail { color: var(--ink-2); font-size: var(--text-xs); }
.warn { display: flex; gap: 6px; align-items: flex-start; color: var(--ink); font-size: var(--text-xs); }
.warn svg { flex: none; width: 15px; height: 15px; margin-top: 1px; color: var(--ink-2); }
.undo { flex: none; }
</style>
