// The AGPL requires offering users the source of the running app.
export default defineNitroPlugin(() => {
  if (!import.meta.dev && !useRuntimeConfig().public.sourceUrl) {
    console.warn('[license] NUXT_PUBLIC_SOURCE_URL is not set. This app is AGPL-3.0: set it to the public repository so users can get the source code.')
  }
})
