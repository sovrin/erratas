import { useNow } from '@vueuse/core'

/**
 * A ticking "now", so relative times stay honest on a page left open.
 *
 * Every age on screen is derived from this one value rather than from
 * `Date.now()` inside a formatter — which keeps the formatters pure, and means
 * a whole list re-renders its ages together instead of drifting row by row.
 *
 * Thirty seconds because the finest unit displayed is a minute: polling faster
 * would re-render the list for a value that cannot have changed.
 */
export function useClock(intervalMs = 30_000) {
  const now = useNow({ interval: intervalMs })
  return computed(() => now.value.getTime())
}
