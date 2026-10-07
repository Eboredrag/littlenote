<script setup lang="ts">
import { Bold, Check, Italic, Minus, Plus, TextAlignCenter, TextAlignEnd, TextAlignStart } from 'lucide-vue-next'
import { NumberFieldDecrement, NumberFieldIncrement, NumberFieldInput, NumberFieldRoot, Toggle, ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'
import type { Align, RGB } from '#shared/types'
import { colorName, FAMILY_CSS, FAMILY_LABEL, type FontOption, fromHex, toHex } from '~/utils/style'

const props = defineProps<{
  /** Fonts used in this file, offered before the standard families. */
  fileFonts: FontOption[]
  /** `file:<fontKey>` or a standard family (`sans`, `serif`, `mono`). */
  fontValue: string
  originalColor?: RGB
  size: number
  bold: boolean
  italic: boolean
  color: RGB
  align: Align
}>()

const emit = defineEmits<{
  change: [patch: { size?: number, bold?: boolean, italic?: boolean, color?: RGB, align?: Align }]
  font: [value: string]
}>()

const standard = (['sans', 'serif', 'mono'] as const).map(f => ({ value: f, label: FAMILY_LABEL[f], css: FAMILY_CSS[f] }))

const swatches = computed(() => {
  const base: RGB[] = [[0, 0, 0], [0.29, 0.29, 0.29], [0.122, 0.227, 0.576], [0.702, 0.149, 0.118], [0.118, 0.42, 0.263]]
  const all = props.originalColor ? [props.originalColor, ...base] : base
  const seen = new Set<string>()
  return all.filter((c) => {
    const h = toHex(c)
    if (seen.has(h)) return false
    seen.add(h)
    return true
  })
})

const current = computed(() => toHex(props.color))
const uid = useId()
</script>

<template>
  <div class="controls">
    <div class="group" role="group" :aria-labelledby="`${uid}-font`">
      <span :id="`${uid}-font`" class="label">Font</span>
      <ToggleGroupRoot
        type="single"
        class="fonts"
        :model-value="fontValue"
        @update:model-value="v => v && emit('font', v as string)"
      >
        <template v-if="fileFonts.length">
          <span class="sub" aria-hidden="true">In this file</span>
          <div class="seg">
            <ToggleGroupItem
              v-for="f in fileFonts"
              :key="f.value"
              :value="f.value"
              class="btn chip"
              :style="{ fontFamily: f.css, fontWeight: f.weight, fontStyle: f.italic ? 'italic' : 'normal' }"
              :aria-label="`${f.label}${f.tag ? `, ${f.tag}` : ''}, from this file`"
            >
              {{ f.label }}<small v-if="f.tag" class="tag">{{ f.tag }}</small>
            </ToggleGroupItem>
          </div>
          <span class="sub" aria-hidden="true">Standard</span>
        </template>
        <div class="seg">
          <ToggleGroupItem v-for="f in standard" :key="f.value" :value="f.value" class="btn chip" :style="{ fontFamily: f.css }" :aria-label="`${f.label} font`">
            {{ f.label }}
          </ToggleGroupItem>
        </div>
      </ToggleGroupRoot>
    </div>

    <div class="row">
      <div class="group">
        <span :id="`${uid}-size`" class="label">Size</span>
        <NumberFieldRoot
          class="stepper"
          :model-value="size"
          :min="4"
          :max="200"
          :step="0.5"
          :format-options="{ maximumFractionDigits: 1 }"
          :aria-labelledby="`${uid}-size`"
          @update:model-value="v => v && emit('change', { size: v })"
        >
          <NumberFieldDecrement class="btn btn-icon" aria-label="Smaller"><Minus /></NumberFieldDecrement>
          <NumberFieldInput class="num size-input" />
          <NumberFieldIncrement class="btn btn-icon" aria-label="Larger"><Plus /></NumberFieldIncrement>
        </NumberFieldRoot>
      </div>

      <div class="group">
        <span class="label" aria-hidden="true">Style</span>
        <div class="seg">
          <Toggle class="btn btn-icon" :model-value="bold" aria-label="Bold" @update:model-value="v => emit('change', { bold: v })"><Bold /></Toggle>
          <Toggle class="btn btn-icon" :model-value="italic" aria-label="Italic" @update:model-value="v => emit('change', { italic: v })"><Italic /></Toggle>
        </div>
      </div>

      <div class="group">
        <span :id="`${uid}-align`" class="label">Align</span>
        <ToggleGroupRoot type="single" class="seg" :model-value="align" :aria-labelledby="`${uid}-align`" @update:model-value="v => v && emit('change', { align: v as Align })">
          <ToggleGroupItem value="left" class="btn btn-icon" aria-label="Align left"><TextAlignStart /></ToggleGroupItem>
          <ToggleGroupItem value="center" class="btn btn-icon" aria-label="Align centre"><TextAlignCenter /></ToggleGroupItem>
          <ToggleGroupItem value="right" class="btn btn-icon" aria-label="Align right"><TextAlignEnd /></ToggleGroupItem>
        </ToggleGroupRoot>
      </div>
    </div>

    <div class="group" role="radiogroup" :aria-labelledby="`${uid}-color`">
      <span :id="`${uid}-color`" class="label">Colour</span>
      <div class="swatches">
        <button
          v-for="(c, i) in swatches"
          :key="toHex(c)"
          type="button"
          class="swatch"
          role="radio"
          :aria-checked="toHex(c) === current"
          :aria-label="`${i === 0 && originalColor ? 'Original colour, ' : ''}${colorName(c)}`"
          :style="{ '--swatch': toHex(c) }"
          @click="emit('change', { color: c })"
        >
          <Check v-if="toHex(c) === current" aria-hidden="true" />
        </button>
        <label class="swatch custom" :class="{ on: !swatches.some(s => toHex(s) === current) }" :style="{ '--swatch': current }">
          <span class="visually-hidden">Pick any colour</span>
          <input type="color" :value="current" @change="e => emit('change', { color: fromHex((e.target as HTMLInputElement).value) })">
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.controls { display: grid; gap: var(--space-4); }
.row { display: flex; flex-wrap: wrap; gap: var(--space-4); }
.group { display: grid; gap: var(--space-2); align-content: start; }
.label { font-size: var(--text-xs); font-weight: 800; color: var(--ink-2); }
.seg { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.fonts { display: grid; gap: var(--space-2); }
.sub { font-size: var(--text-xs); font-weight: 700; color: var(--ink-3); }
.chip { background: var(--card-sunk); font-weight: 400; font-size: var(--text-md); padding: 0 var(--space-4); }
.tag { margin-left: 6px; font-family: var(--font-ui); font-style: normal; font-weight: 750; font-size: var(--text-xs); color: var(--ink-3); }
.chip[data-state='on'] { box-shadow: inset 0 0 0 2px var(--action); }

.stepper {
  display: flex;
  align-items: center;
  background: var(--card-sunk);
  border-radius: var(--radius-pill);
}
.size-input {
  width: 3.5rem;
  min-height: var(--tap);
  border: 0;
  background: transparent;
  text-align: center;
  font-weight: 800;
  border-radius: 10px;
}
.size-input:focus-visible { outline: 3px solid var(--action); }

.swatches { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.swatch {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--tap);
  height: var(--tap);
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--swatch);
  color: #fff;
  box-shadow: inset 0 0 0 1px rgb(43 29 22 / 0.15);
  transition: transform 220ms var(--spring);
  cursor: pointer;
}
.swatch:active { transform: scale(0.94); }
.swatch[aria-checked='true'], .swatch.on { box-shadow: 0 0 0 3px #fff, 0 0 0 5px var(--action); }
.swatch svg { width: 20px; height: 20px; stroke-width: 3; mix-blend-mode: difference; }
.custom {
  background: conic-gradient(from 90deg, #e74c3c, #f1c40f, #2ecc71, #3498db, #9b59b6, #e74c3c);
}
.custom.on { background: var(--swatch); }
.custom input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.custom:focus-within { outline: 3px solid var(--action); outline-offset: 3px; }
</style>
