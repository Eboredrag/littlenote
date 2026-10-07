/** Reactive media query (false during SSR). */
export function useMedia(query: string) {
  const matches = ref(false)
  if (import.meta.client) {
    const mql = window.matchMedia(query)
    matches.value = mql.matches
    const on = (e: MediaQueryListEvent) => { matches.value = e.matches }
    mql.addEventListener('change', on)
    onScopeDispose(() => mql.removeEventListener('change', on))
  }
  return matches
}

/** Wide layouts float panels beside the page; narrow ones use bottom sheets. */
export const useWide = () => useMedia('(min-width: 1100px)')
