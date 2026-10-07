/** The site's public origin: `NUXT_PUBLIC_SITE_URL` when set, otherwise the address of the current request. */
export function useSiteUrl() {
  const configured = useRuntimeConfig().public.siteUrl as string
  const origin = configured ? configured.replace(/\/+$/, '') : useRequestURL().origin
  return (path = '/') => new URL(path, `${origin}/`).href
}
