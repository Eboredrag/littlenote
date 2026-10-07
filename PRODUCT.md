# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Nuxt 4 full-stack (Vue 3, Nitro node-server). MuPDF.js (AGPL-3.0) on the server for text extraction, true text removal and PDF writing; pdf.js in the browser for page rendering.

## Users

Anyone who needs to fix a PDF they did not make: a typo in a form, CV, invoice or letter. Occasional use, no account, wants the job done in minutes and the file back looking like nobody touched it.

## Product Purpose

Open a PDF in the browser, see exactly which font, size, weight and color every piece of text uses, change the words (or restyle them, add new text, delete/rotate/reorder pages), and download a new PDF. Success: the downloaded file looks untouched except for the intended edits.

## Positioning

- **Edits look untouched.** Original glyphs are removed from the content stream and the new text is written in the same font, size, color and position. No white boxes; search and copy in the result find only the new text.
- **Private, no signup.** No account, no watermark. Uploaded files are kept only for the editing session (30-minute TTL) and can be deleted immediately by the user.

## Operating Context

A single document at a time, often on a phone. The user arrives with a file, edits a handful of words, downloads, leaves. Fonts in real-world PDFs are frequently subset-embedded, so a newly typed character may be missing from the original font and require a substitute.

## Capabilities and Constraints

- v1: read per-run font info (raw name, family, embedded/subset, font type, size, weight/style, color); edit existing text blocks; restyle (font, size, color, bold/italic); add new text boxes; delete, rotate and reorder pages; undo/redo; download.
- Read-only in v1: Type3 fonts, scanned/image text (no OCR), right-to-left and vertical text.
- An edited block collapses mixed runs into its dominant style; unedited blocks keep everything.
- MuPDF.js is AGPL-3.0, so the app is AGPL-3.0 too; decided: published at github.com/Eboredrag/littlenote and linked from the site.

## Brand Commitments

- Name: **littlenote** (always lowercase), at littlenote.io. Confirmed by the user.
- Source: github.com/Eboredrag/littlenote, AGPL-3.0.
- Do not invent claims, customers or statistics.

## Evidence on Hand

None. No testimonials, usage numbers or press exist; never fabricate them.

## Product Principles

1. **The document leads.** The page is the interface; tools appear around what is selected, never as a wall of buttons.
2. **Nothing hidden.** The user can always see what changed, whether a font was substituted (and why), and whether their file still exists on the server.
3. **Untouched-looking output** beats feature count.
4. **Private by default.** Keep files only as long as needed and make deletion visible and immediate.

## Accessibility & Inclusion

WCAG 2.2 AA. Editing on mobile (touch, on-screen keyboard) is a first-class case, not view-only. Full keyboard operation of selection, editing and page operations; visible focus; reduced-motion respected.
