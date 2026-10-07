# PDF editor

Open a PDF in the browser, see exactly which font, size and colour every piece of text uses, change the words (or restyle them, add text, rotate/reorder/delete pages) and download a new PDF that looks untouched.

## Run it

Needs [Bun](https://bun.sh) 1.3 or newer.

```sh
bun install
bun run dev          # http://localhost:3000
bun run test         # server tests (extraction, true replacement, fonts, page ops)
bun run typecheck
bun run fixtures     # regenerate tests/fixtures/*.pdf
bun run build && bun run preview   # production server on Bun
```

## Deploy

No database is needed: uploads are plain files, kept for 30 minutes after their last use.

### Docker

```sh
NUXT_PUBLIC_SITE_URL=https://pdf.example.com docker compose up -d --build
```

The image (`Dockerfile`) builds with Bun and ships only the built server on `oven/bun:1.3-slim`, running as the unprivileged `bun` user on port 3000. Uploads are stored on the `/data` volume, and a health check polls the home page.

### Without Docker

Copy `.output/` to the server and run `bun .output/server/index.mjs`. It needs nothing else from this repository.

| Setting | Default | Purpose |
| --- | --- | --- |
| `PORT` / `HOST` | `3000` / all interfaces in Docker | Where the server listens |
| `NUXT_UPLOADS_DIR` | `.data/uploads` (`/data/uploads` in Docker) | Where uploads are kept; use a persistent disk |
| `NUXT_PUBLIC_SOURCE_URL` | this repository | Public source link, required by the AGPL when hosted; set it to your fork if you change the code |
| `NUXT_PUBLIC_SITE_URL` | the request's own address | Public address (e.g. `https://pdf.example.com`) for canonical links, link previews and the sitemap |

Run a single instance, or share the uploads folder between instances. If a proxy sits in front, allow 50 MB request bodies.

### Search and link previews

The home page carries a title, description, canonical link, Open Graph and Twitter tags (with `public/og-image.png`) and `WebApplication` structured data. `/robots.txt` and `/sitemap.xml` are generated from `NUXT_PUBLIC_SITE_URL`. Editing sessions (`/edit/…`) and the API are marked `noindex` and never send their address to other sites. The preview image and home-screen icon are drawn in `design/social.html`; see the note at its top to regenerate them.

## How it works

- **Nuxt 4 full-stack.** The browser renders pages with pdf.js; the Nitro server does all PDF reading and writing with [MuPDF.js](https://mupdf.com) (WebAssembly).
- **Reading fonts** (`server/utils/extract.ts`, `pdfFonts.ts`): MuPDF structured text gives every character's font, size and colour; the server matches each runtime font to its PDF font resource to report the real `BaseFont`, whether it is embedded or subset, and its format.
- **True replacement** (`server/utils/applyOps.ts`): edited lines are removed with text-only redaction (images and vector art untouched), then the new text is written into the page content stream at the original baseline, in the original direction, with the original colour.
- **Same font when possible** (`server/utils/writeText.ts`): the new text is first encoded with the document's own font object (via its ToUnicode map or simple encoding), so edits that reuse letters already in the file keep the exact original font. Otherwise it falls back to a standard PDF font with the same name, then to bundled Liberation fonts (metric-compatible with Arial/Helvetica, Times and Courier). Every substitution is reported to the user in plain words.
- **Stateless edits**: the client keeps an edit list (with undo/redo); the server applies the whole list to a fresh copy of the original on each preview and on download.
- **Privacy**: uploads live in `.data/uploads` for 30 minutes after the last request (a scheduled task cleans up), or until the user presses *Delete now*.

## Known limits (v1)

- Editing a block that mixes styles writes all of it in its dominant style.
- Type3 fonts, scanned/image text, angled, right-to-left and vertical text are read-only.
- Password-protected PDFs are opened with the password and downloaded without one.

## Licence

This app is free software under the **GNU Affero General Public License v3.0 or later** (see [LICENSE](LICENSE)). It has to be: it uses [MuPDF.js](https://mupdf.com), which is AGPL-licensed.

What that means when you host it:

- Anyone who uses your hosted copy must be able to get its complete source code, including your changes, under the same licence.
- The source link points at [github.com/Eboredrag/pdf-editor](https://github.com/Eboredrag/pdf-editor). If you run a changed copy, publish your changes and set `NUXT_PUBLIC_SOURCE_URL` to your repository. The app then shows "Open source under the AGPL-3.0, click here to view the source" on the home page and in the Changes panel, linking to it. A production server without it logs a warning at startup.
- You may host it, charge for it, brand it and change it; you may not keep the code closed while offering it as a service.

Third-party parts keep their own licences:

| Part | Licence |
| --- | --- |
| MuPDF.js (PDF engine, server) | AGPL-3.0-or-later |
| pdf.js (page rendering, browser) | Apache-2.0 |
| Liberation fonts (`public/fonts`) | SIL Open Font License 1.1 |
| Nunito (`public/fonts/ui`) | SIL Open Font License 1.1 |
