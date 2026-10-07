export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  modules: ['@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'PDF editor',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content' },
        { name: 'description', content: 'Fix a name, a date or a typo in your PDF and download it looking untouched, in the same fonts. No account; files are deleted after 30 minutes.' },
        { name: 'theme-color', content: '#f6dccb' },
      ],
      link: [
        // The interface font, fetched alongside the HTML so text paints in Nunito from the start.
        { rel: 'preload', as: 'font', type: 'font/woff2', href: '/fonts/ui/nunito-latin-wght-normal.woff2', crossorigin: 'anonymous' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '48x48', href: '/favicon-48.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },
  runtimeConfig: {
    // Where uploads are kept while being edited. Override with NUXT_UPLOADS_DIR.
    uploadsDir: '.data/uploads',
    public: {
      // Public link to this app's source code, required by the AGPL when hosted.
      // Override with NUXT_PUBLIC_SOURCE_URL when running a fork.
      sourceUrl: 'https://github.com/Eboredrag/pdf-editor',
      // The public address of the site, e.g. https://pdf.example.com (NUXT_PUBLIC_SITE_URL).
      // Used for canonical links, link previews and the sitemap; the request's own origin is used when unset.
      siteUrl: '',
    },
  },
  routeRules: {
    // Editing sessions are private and short-lived: keep them out of search results and
    // don't leak their addresses to other sites through the Referer header.
    '/edit/**': { headers: { 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' } },
    '/api/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
  },
  nitro: {
    // Runs on Bun (see Dockerfile). The output is a single `bun .output/server/index.mjs`.
    preset: 'bun',
    externals: {
      external: ['mupdf'],
      traceInclude: ['node_modules/mupdf/dist/mupdf-wasm.wasm'],
    },
    serverAssets: [{ baseName: 'fonts', dir: '../public/fonts' }],
    experimental: { tasks: true },
    scheduledTasks: { '*/5 * * * *': ['cleanup-uploads'] },
  },
  vite: {
    optimizeDeps: { include: ['pdfjs-dist'] },
  },
  typescript: { strict: true },
})
