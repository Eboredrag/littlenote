import type { H3Event } from 'h3'

/** The site's public origin: `NUXT_PUBLIC_SITE_URL` when set, otherwise the request's own origin. */
export function siteOrigin(event: H3Event) {
  const configured = useRuntimeConfig(event).public.siteUrl as string
  return configured ? configured.replace(/\/+$/, '') : getRequestURL(event).origin
}
