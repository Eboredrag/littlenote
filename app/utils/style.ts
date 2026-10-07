import type { Block, FallbackFamily, FontChoice, FontInfo, PageModel, Point, RGB, StyleOverride, TextStyle } from '#shared/types'

export const FAMILY_LABEL: Record<FallbackFamily, string> = { sans: 'Sans', serif: 'Serif', mono: 'Mono' }
export const FAMILY_CSS: Record<FallbackFamily, string> = {
  sans: '\'Ed Sans\', Arial, sans-serif',
  serif: '\'Ed Serif\', \'Times New Roman\', serif',
  mono: '\'Ed Mono\', \'Courier New\', monospace',
}

export function toHex([r, g, b]: RGB) {
  return `#${[r, g, b].map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`
}

export function fromHex(hex: string): RGB {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => Math.round(v * 1000) / 1000) as RGB
}

/** Plain-language colour names for the few colours people usually mean. */
export function colorName(rgb: RGB) {
  const [r, g, b] = rgb
  if (r + g + b < 0.12) return 'Black'
  if (r > 0.97 && g > 0.97 && b > 0.97) return 'White'
  if (Math.abs(r - g) < 0.04 && Math.abs(g - b) < 0.04) return 'Grey'
  return toHex(rgb).toUpperCase()
}

/** Effective style of a block after an optional override. */
export function resolvedStyle(block: Block, override?: StyleOverride, fonts?: Record<string, FontInfo>): TextStyle & { choice: FontChoice } {
  const s = block.style
  const choice = override?.font ?? 'original'
  const switched = override?.fontKey ? fonts?.[override.fontKey] : undefined
  return {
    ...s,
    fontKey: override?.fontKey ?? s.fontKey,
    family: choice === 'original' ? (switched?.fallback ?? s.family) : choice,
    size: override?.size ?? s.size,
    color: override?.color ?? s.color,
    bold: override?.bold ?? s.bold,
    italic: override?.italic ?? s.italic,
    align: override?.align ?? s.align,
    choice,
  }
}

export function fontTitle(info?: FontInfo) {
  if (!info) return 'Unknown font'
  const style = [info.bold && 'Bold', info.italic && 'Italic'].filter(Boolean).join(' ')
  return style ? `${info.family} ${style}` : info.family
}

export function angleOf(dir: Point) {
  return Math.round((Math.atan2(dir[1], dir[0]) * 180) / Math.PI)
}

export function formatTime(ms: number) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(ms)
}

export interface FontOption {
  value: string
  label: string
  css: string
  weight: number
  italic: boolean
  tag?: string
}

/**
 * Fonts used in this file as picker options: those on `page` first (most used first),
 * one entry per family and style. Type3 fonts can't draw new text, so they are left out.
 */
export function fileFontOptions(fonts: Record<string, FontInfo>, pages: PageModel[], page: number, ownKey?: string): FontOption[] {
  const usage = new Map<string, number>()
  pages.forEach((p) => {
    for (const b of p.blocks) for (const l of b.lines) for (const r of l.runs) {
      const weight = r.text.trim().length * (p.index === page ? 1000 : 1)
      usage.set(r.fontKey, (usage.get(r.fontKey) ?? 0) + weight)
    }
  })
  const seen = new Map<string, FontOption>()
  const ranked = Object.values(fonts)
    .filter(f => f.type !== 'Type3')
    .sort((a, b) => (b.key === ownKey ? 1 : 0) - (a.key === ownKey ? 1 : 0) || (usage.get(b.key) ?? 0) - (usage.get(a.key) ?? 0))
  for (const f of ranked) {
    const label = fontTitle(f)
    if (seen.has(label)) continue
    seen.set(label, { value: `file:${f.key}`, label, css: FAMILY_CSS[f.fallback], weight: f.bold ? 700 : 400, italic: f.italic, tag: f.key === ownKey ? 'original' : undefined })
  }
  return [...seen.values()]
}
