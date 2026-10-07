<script setup lang="ts">
import type { PDFDocumentProxy } from 'pdfjs-dist'

const props = defineProps<{ doc: PDFDocumentProxy | null, index: number, rotation: number, width: number }>()
const canvas = ref<HTMLCanvasElement>()
const ready = ref(false)
let token = 0

async function paint() {
  if (!props.doc || !canvas.value) return
  const mine = ++token
  try {
    const page = await props.doc.getPage(props.index + 1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: (props.width / base.width) * Math.min(window.devicePixelRatio || 1, 2) })
    const off = document.createElement('canvas')
    off.width = Math.floor(viewport.width)
    off.height = Math.floor(viewport.height)
    await page.render({ canvas: off, viewport }).promise
    if (mine !== token || !canvas.value) return
    canvas.value.width = off.width
    canvas.value.height = off.height
    canvas.value.getContext('2d')!.drawImage(off, 0, 0)
    ready.value = true
  }
  catch {}
}

watch(() => props.doc, paint)
onMounted(paint)
</script>

<template>
  <div class="thumb" :class="{ ready }" :style="{ width: `${width}px`, transform: rotation ? `rotate(${rotation}deg) scale(${rotation % 180 ? 0.72 : 1})` : undefined }">
    <canvas ref="canvas" aria-hidden="true" />
  </div>
</template>

<style scoped>
.thumb {
  background: #fff;
  border-radius: 3px;
  box-shadow: 0 1px 2px rgb(73 35 14 / 0.12), 0 4px 10px -4px rgb(73 35 14 / 0.25);
  transition: transform 320ms var(--ease-out);
  min-height: 40px;
}
canvas { display: block; width: 100%; height: auto; border-radius: 3px; }
</style>
