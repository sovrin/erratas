import type PocketBase from 'pocketbase'

export function usePocketbase(): PocketBase {
  return useNuxtApp().$pb as PocketBase
}
