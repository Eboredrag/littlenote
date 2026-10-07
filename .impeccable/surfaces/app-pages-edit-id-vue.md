---
version: 1
slug: "app-pages-edit-id-vue"
primary_target: "app/pages/edit/[id].vue"
related_targets: ["app/pages/index.vue"]
---

# Surface brief: PDF editor (editor route + upload route)

Scope: `app/pages/edit/[id].vue` (editor) and `app/pages/index.vue` (upload), one world. Visitor mode: **Operate**.

Audience and job: anyone fixing a PDF they did not make (CV, invoice, form, letter), often on a phone; open, fix a few words, download, leave. Task states: empty/upload, loading/parsing, idle document, block selected, editing, font substituted, page ops, rendering preview, download ready, file deleted, errors (not a PDF, encrypted, too large, read-only block). Constraints: WCAG 2.2 AA, mobile editing first-class, no brand name yet, no invented claims, document dominates, no dense toolbars, no hidden state.

## Direction contract

THESIS: A friendly fixer, not a PDF tool. The page is the only big thing on screen; everything else is a soft white card that says in plain words what it is and what will happen. It refuses the category default of an icon ribbon plus thumbnail sidebar plus properties panel, and the ad-wall tile grid.

OWN-WORLD: Warm apricot-tinted ground (pinkish-orange, never cream), white cards with large soft radii (20px cards, 999px pills), warm near-black ink and warm grey secondary text. One saturated ultramarine is the only action colour and appears strictly on things you can press (primary buttons, the active tab, selection outline, focus ring); disabled controls lose it entirely. Status (substituted font, deleted file, unsaved preview) speaks in plain-language card rows with an icon, never in extra hues. Rounded humanist sans (Nunito, self-hosted) at comfortable sizes, tabular figures for sizes/positions. Generous touch targets (min 44px).

STORY: The visitor drops a file and immediately sees their own page, big. They tap a line, a card tells them "Calibri Bold, 11 pt, black — Edit text", they type, and a change chip counts up in the bottom bar. If a font has to be swapped the card says so in one sentence. They tap Download and leave with a file that looks untouched, and they can see the server copy is deleted.

FIRST VIEWPORT: Editor: the PDF page centred on the apricot ground, as large as fits, with a soft shadow. Top: one slim white pill card with the file name, page count and "Kept until 13:42 · Delete now". Bottom: one persistent white bar card, thumb-reachable, holding Pages, Add text, Undo, Changes (n) and the ultramarine Download pill at the right. Nothing else until something is selected; the selection card then floats beside the block on desktop and rises as a bottom sheet on mobile. Upload: a large headline and one plain sentence of product facts (no account; deleted 30 minutes after the last change or right away) beside a big white paper sheet that is the drop target, holding the ultramarine "Choose a PDF" pill; stacked on narrow screens. The zoom control lives inside the editor's top pill, which shares the page column's width.

FORM: Warm consumer app surface (dealt challenger, fused; chosen over my grounded list, assigned position 3 "Preflight Job Ticket" not taken). Seed key 634caaa0. Signature interaction: tap a block and its outline lifts off the page on a soft shadow as its font card rises beside it (pressing the lifted block gives a soft spring); committing an edit bumps the Changes counter. Changed blocks carry a small ink marker (a diamond when the font was swapped), never the action colour. Motion grammar: soft spring on press only (scale 0.97), entrances ease out, sheets ease up from the bottom, no bounce on entry, all motion off under prefers-reduced-motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Product name (none yet; use a neutral descriptive title "PDF editor").
