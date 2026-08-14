import type { Repositories } from '~/repositories/types'

/**
 * How the rest of the app reaches storage.
 *
 * The indirection is the point: composables and components name this, never
 * `usePocketbase`, so the PocketBase SDK has exactly one consumer
 * (`app/repositories/pocketbase/`) and swapping it never reaches a call site.
 */
export function useRepositories(): Repositories {
  return useNuxtApp().$repositories as Repositories
}
