---
name: PDF editor
description: A friendly fixer for PDFs you did not make; the page is the only big thing on screen.
colors:
  ground: "#f6dccb"
  ground-deep: "#efc8b0"
  card: "#ffffff"
  card-sunk: "#fbf1ea"
  line: "#f1e1d6"
  line-strong: "#e4cbbb"
  ink: "#2b1d16"
  ink-2: "#6e5243"
  ink-3: "#87685a"
  action: "#3b34e6"
  action-press: "#2c25c4"
  action-tint: "rgb(59 52 230 / 0.1)"
  action-tint-strong: "rgb(59 52 230 / 0.18)"
  on-action: "#ffffff"
typography:
  display:
    fontFamily: "'Nunito Variable', 'Nunito Fallback', ui-rounded, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 1.4rem + 3.4vw, 4.25rem)"
    fontWeight: 900
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Nunito Variable', 'Nunito Fallback', ui-rounded, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 850
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Nunito Variable', 'Nunito Fallback', ui-rounded, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 850
    lineHeight: 1.5
  body:
    fontFamily: "'Nunito Variable', 'Nunito Fallback', ui-rounded, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "'Nunito Variable', 'Nunito Fallback', ui-rounded, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Nunito Variable', 'Nunito Fallback', ui-rounded, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: 1
  caption:
    fontFamily: "'Nunito Variable', 'Nunito Fallback', ui-rounded, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 800
    lineHeight: 1.5
rounded:
  page: "4px"
  sheet: "6px"
  control: "14px"
  card: "20px"
  bar: "28px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  tap: "44px"
  bar-height: "72px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  button-hover:
    backgroundColor: "{colors.card-sunk}"
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.action-press}"
  button-primary-disabled:
    backgroundColor: "{colors.line-strong}"
    textColor: "{colors.ink-2}"
  button-soft:
    backgroundColor: "{colors.card-sunk}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  button-soft-hover:
    backgroundColor: "{colors.line}"
  button-on:
    backgroundColor: "{colors.action-tint}"
    textColor: "{colors.action}"
  button-icon:
    rounded: "{rounded.pill}"
    width: "44px"
    height: "44px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
  bottom-bar:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.bar}"
    padding: "8px"
    height: "72px"
  badge:
    backgroundColor: "{colors.card-sunk}"
    textColor: "{colors.ink-2}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  note-row:
    backgroundColor: "{colors.card-sunk}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.control}"
    padding: "12px"
  input-field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  color-swatch:
    rounded: "{rounded.pill}"
    width: "44px"
    height: "44px"
---

# Design System: PDF editor

## Overview

**Creative North Star: "The Friendly Fixer"**

This is a warm consumer app, not a PDF tool. A pinkish-apricot ground holds the user's own page, centred, large and shadowed like a real sheet of paper; everything else is a soft white card that says in plain words what it is and what will happen. Controls collect into two floating pieces of furniture (a slim file pill at the top, a persistent bottom bar within thumb reach) and a selection card that appears only when something is selected. There is no icon ribbon, no permanent thumbnail sidebar, no properties panel.

The palette is warm and almost monochrome: apricot ground, white card, warm near-black ink, warm grey secondary text. One saturated ultramarine marks the things you can press and the thing you have selected. Status (a substituted font, a deleted file, an edited block) speaks through ink, icons and plain sentences in a card row, never through extra hues.

Type is one rounded humanist sans (Nunito, variable, self-hosted) run at comfortable sizes with heavy weights (800-900) for headings and labels, and tabular figures wherever a number is a measurement. Touch targets never drop below 44px. Motion is soft: entrances ease out, sheets rise from the bottom, and only a press gets a spring.

**Key Characteristics:**
- Apricot ground, white cards, one ultramarine action colour.
- The document is the only large object; chrome floats around it as cards.
- Large soft radii: 20px cards, 28px bar, 999px pills; paper keeps tight 4-6px corners.
- Warm-tinted, diffuse shadows (brown, never grey or black).
- Nunito at heavy weights, tabular figures for sizes and positions.
- 44px minimum hit area on every control.
- Spring on press only; ease-out for every entrance.

## Colors

A warm apricot-and-paper palette with a single cold, saturated ultramarine reserved for action.

### Primary
- **Press Ultramarine** (action): primary button fill, active/pressed toggles (as text on Action Tint), selected text-block outline, edit caret, focus ring, link text, the Changes counter bubble, the dragging drop-target ring.
- **Deep Ultramarine** (action-press): hover fill of the primary button only.
- **Ultramarine Wash** (action-tint): hover and selected wash on page text blocks, pressed toggle background, drop-target row highlight, input focus halo.
- **Ultramarine Wash Strong** (action-tint-strong): text selection and the halo around a live edit field.
- **On Ultramarine** (on-action): text and icons on Press Ultramarine.

### Neutral
- **Apricot Ground** (ground): the app background behind everything. Pinkish-orange, never cream.
- **Deep Apricot** (ground-deep): scrollbar thumbs and the inset ring on a font-substitution note.
- **Card White** (card): every card, bar, sheet, pill, and the paper itself.
- **Sunk Blush** (card-sunk): recessed fills inside cards: soft buttons, badges, note rows, steppers, chips, hover on ghost buttons.
- **Hairline Blush** (line): 1px dividers inside cards; hover of soft buttons.
- **Rule Blush** (line-strong): bar separators, input borders, disabled primary fill.
- **Warm Ink** (ink): all primary text.
- **Cocoa Grey** (ink-2): secondary text, metadata, icons in status rows, changed-block markers.
- **Faint Cocoa** (ink-3): tertiary text (raw font names, field labels, placeholders, disabled labels). White surfaces only.

### Named Rules
**The Pressable Ultramarine Rule.** Ultramarine marks what you can press, what is pressed, and what is selected or focused. Disabled controls lose it entirely (disabled primary falls to Rule Blush on Cocoa Grey). It never colours status, decoration or headings.

**The No Extra Hues Rule.** Status never adds a colour. Substituted fonts, deleted files and edited blocks are told with an icon, ink, a plain sentence and, where needed, a Deep Apricot ring. Changed-block markers are Cocoa Grey dots (a diamond when the font was swapped), never ultramarine.

**The White-Only Faint Rule.** Faint Cocoa (ink-3) passes contrast only on Card White. Never set it on the apricot ground or on Sunk Blush; use Cocoa Grey there.

## Typography

**Display Font:** Nunito Variable (self-hosted, preloaded; metric-matched Arial fallback 'Nunito Fallback', then ui-rounded, system-ui, sans-serif)
**Body Font:** Nunito Variable (same stack)

**Character:** One rounded humanist family carries everything; hierarchy comes from weight (400 to 900) and size, not from a second face. Heavy weights read friendly rather than corporate because of the rounded terminals.

The Liberation Sans/Serif/Mono faces loaded as "Ed Sans", "Ed Serif" and "Ed Mono" are document fallback fonts for in-page text editing (matching what the server embeds). They are document content, not UI type; never use them for interface text.

### Hierarchy
- **Display** (900, clamp(2.25rem, 1.4rem + 3.4vw, 4.25rem), 1.02, -0.03em, balanced wrap): the upload headline only.
- **Headline** (850, 1.375rem, 1.2, -0.01em): card titles such as the selected font name, the drop target title, empty and error states. Also the 1.375rem lede at line-height 1.4, weight 400, in Cocoa Grey.
- **Title** (850, 1.0625rem): panel headings (Pages, Changes) and the file name (at 0.9375rem).
- **Body** (400, 1.0625rem, 1.5): default text. Small body (0.9375rem, line-height 1.45-1.55) for notes, hints, toasts and product facts, capped near 24-26rem.
- **Label** (700, 0.9375rem, line-height 1): button labels. Weights 750-800 for list labels and fact values.
- **Caption** (700-800, 0.8125rem): metadata, badges, field labels, keep-until text. Sentence case.

### Named Rules
**The Tabular Measurement Rule.** Any number that is a size, position, zoom, page count or time uses tabular figures (the `num` utility: `font-variant-numeric: tabular-nums`).

**The One Family Rule.** Interface type is Nunito only; weight does the work a second family would.

## Layout

The editor is a full-viewport shell: an auto-height top row holding one white file pill, and a scrolling stage below where pages stack in a centred column with 32px gaps. The bottom bar is fixed, centred, 72px tall, 12px off the bottom edge plus the safe-area inset; the stage pads its bottom by bar height + 48px so the last page clears it. Floating panels attach to edges: the page rail at left (212px wide, 16px inset, the page column shifts right by 200px when it is open), the changes list at bottom-right (380px), the selection card beside the selected block (340px).

The upload page is a two-column grid (text up to 30rem, paper sheet up to 440px) centred vertically with a clamp(32px, 6vw, 96px) gap.

Spacing runs on a 4px base: 4, 8, 12, 16, 24, 32, 48. Overlay cards keep 12px from the viewport edge on narrow screens (`calc(100vw - 24px)`).

**Breakpoints:** at 720px the editor goes mobile: the bottom bar stretches edge to edge (8px insets) with stacked icon-over-label tools, the file icon and separators hide, long labels swap for short ones, and the selection card, page rail and changes list become bottom sheets docked above the bar (max 60-62dvh). At 860px the upload page stacks to one column. `pointer: coarse` raises the page-rail tool buttons to 44px and hides mouse-only hints.

### Named Rules
**The Page Leads Rule.** Nothing except the paper is large. Chrome lives in floating cards at the edges; panels appear on demand and leave when dismissed.

**The Thumb Bar Rule.** Primary editor actions live in the one bottom bar, with Download as the ultramarine pill at its right end.

## Elevation & Depth

Depth is a floating-card model: the ground is flat, and every card, bar and sheet sits on a soft, warm-brown (rgb 73 35 14) two-layer shadow, a tight contact shadow plus a large negative-spread ambient. Paper reads deepest of all. Selection lifts a block off the page with an ultramarine-tinted shadow. There are no hard offsets, no grey or black shadows, and no borders standing in for depth on cards.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 2px rgb(73 35 14 / 0.06), 0 10px 28px -6px rgb(73 35 14 / 0.16)`): resting cards, the top pill.
- **Float** (`box-shadow: 0 2px 4px rgb(73 35 14 / 0.08), 0 18px 40px -8px rgb(73 35 14 / 0.24)`): the bottom bar, selection card, sheets, toast, hint, dragged items.
- **Page** (`box-shadow: 0 1px 3px rgb(73 35 14 / 0.1), 0 16px 40px -10px rgb(73 35 14 / 0.28)`): PDF pages and the upload paper sheet.
- **Action glow** (`box-shadow: 0 6px 16px -6px rgb(59 52 230 / 0.6)`): under the primary pill only.
- **Selection lift** (`box-shadow: 0 0 0 2px var(--action), 0 10px 22px -8px rgb(59 52 230 / 0.45)`): a selected text block.

### Named Rules
**The Warm Shadow Rule.** Shadows are tinted warm brown (rgb 73 35 14), or ultramarine for action and selection. Never neutral grey or black.

## Shapes

Two corner languages coexist. Interface is generously round: 20px cards, 22px top pill, 28px bar (24px on mobile), 14px controls and notes, 999px pills for every button, badge and stepper, circular swatches. Document objects stay nearly square: paper 4px, the upload sheet 6px, thumbnails 3px, text-block hit areas 6px, edit fields 2px. The contrast between round chrome and square paper is what keeps the document reading as the real thing.

Inner list items sit between (12-16px). Focus rings are a 3px ultramarine outline, 2px offset, with a 10px radius.

## Components

### Buttons
Soft, chunky pills that answer a press with a small spring.
- **Shape:** full pill (999px), minimum 44 x 44px, 8px icon gap, 20px Lucide line icons at stroke 2.25.
- **Base / ghost:** transparent with Warm Ink label; hover fills Sunk Blush.
- **Primary:** Press Ultramarine fill, white label, 24px horizontal padding, ultramarine glow beneath; hover deepens to Deep Ultramarine. Disabled: Rule Blush fill, Cocoa Grey label, no glow.
- **Soft:** Sunk Blush fill; hover goes to Hairline Blush. The default for secondary actions inside cards (Delete now, Cancel, Try again).
- **Icon:** square 44px pill.
- **On / pressed toggles:** Ultramarine Wash fill with ultramarine label.
- **Press:** `scale(0.97)` over 220ms on the spring curve; colour changes 160ms ease.
- **Focus:** 3px ultramarine outline, 2px offset.

### Chips (style toggles)
- **Style:** Sunk Blush pill at body size and regular weight (font choices preview in their own face).
- **State:** selected adds a 2px inset ultramarine ring.

### Badges
Sunk Blush pills, 4px 10px padding, Cocoa Grey caption at 750 weight. Used for font facts (embedded, subset, type) and panel counts.

### Cards / Containers
- **Corner Style:** 20px.
- **Background:** Card White.
- **Shadow Strategy:** Card at rest, Float when overlaying the stage (see Elevation & Depth).
- **Border:** none; inner sections divide with 1px Hairline Blush.
- **Internal Padding:** 16-24px; the selection card's action row sticks to the bottom and gains a top hairline and upward shadow once the card scrolls.

### Note Rows (status)
Sunk Blush, 14px radius, 12px padding, small body in Warm Ink with an 18px Cocoa Grey icon. A font substitution adds an inset 2px Deep Apricot ring. A plain "all good" note drops the fill and reads in Cocoa Grey.

### Inputs / Fields
- **Style:** Card White, 2px Rule Blush border, 14px radius, 48px tall, body size.
- **Focus:** border turns ultramarine with a 4px Ultramarine Wash halo.
- **Placeholder:** Faint Cocoa.

### Navigation
- **Top file pill:** one white card (22px radius) carrying the file icon, name (title weight), caption metadata, the keep-until line with an underlined ultramarine "Delete now" link, and the zoom control behind a 1px hairline. It shares the page column's width.
- **Bottom bar:** white Float card, 72px tall, 28px radius, tools as ghost buttons with icon + label, 1px Rule Blush separators, the Changes button carrying an ultramarine count bubble (20px, white ring) that bumps on each commit, and the Download primary pill (52px tall) at the right. Mobile: full width, stacked icon-over-label tools at 13px/800.

### Page Text Blocks (signature)
Invisible hit areas over the PDF text. Hover shows Ultramarine Wash. Selected: wash plus 2px ultramarine outline and the Selection lift shadow, entering with a 340ms ease-out lift; pressing it springs to `scale(0.98)`. Read-only blocks use ink tints instead of ultramarine. Edited blocks carry a 10px Cocoa Grey dot at the top-left with a white ring; a swapped font turns it into a rotated diamond outline.

### Selection Card (signature)
A 340px floating Float card beside the selected block on desktop (rises 300ms from 6px below at 0.98 scale), a bottom sheet above the bar on mobile (rises 320ms from 24px). It leads with the font name as headline, the raw font name in Faint Cocoa, badge row, facts (size, weight, colour dot) as caption labels over 750-weight values, status notes, style controls, then a sticky action row.

### Colour Swatches
44px circles with a hairline inset ring; selected gets a white 3px gap and a 2px ultramarine ring; press springs to `scale(0.94)`.

## Do's and Don'ts

### Do:
- **Do** keep the PDF page the only large object; float all chrome as white cards on the apricot ground.
- **Do** reserve ultramarine (#3b34e6) for pressable, pressed, selected and focused things; strip it from disabled controls.
- **Do** report status with an icon, ink and one plain sentence in a Sunk Blush note row.
- **Do** use the spring curve (cubic-bezier(0.34, 1.32, 0.64, 1)) only for `:active` press feedback (scale 0.94-0.98), and the ease-out curve (cubic-bezier(0.16, 1, 0.3, 1)) for every entrance, lift and sheet rise.
- **Do** keep every control at least 44px in both directions.
- **Do** tint all shadows warm brown (rgb 73 35 14) or ultramarine for action.
- **Do** set measurements in tabular figures.
- **Do** turn all motion off under prefers-reduced-motion.

### Don't:
- **Don't** build an icon ribbon, a permanent thumbnail sidebar or a properties panel.
- **Don't** introduce extra status hues (no green success, amber warning or red error fills); errors are bold Warm Ink text.
- **Don't** bounce or spring an entrance; the spring belongs to presses only.
- **Don't** set Faint Cocoa (#87685a) on the apricot ground or Sunk Blush.
- **Don't** shift the ground toward cream; it stays pinkish apricot.
- **Don't** use grey/black or hard-offset shadows.
- **Don't** use the Ed Sans/Serif/Mono document fonts for interface text.
