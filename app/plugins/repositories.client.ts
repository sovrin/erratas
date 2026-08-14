import { createPocketBaseRepositories } from '~/repositories/pocketbase'
import type { Repositories } from '~/repositories/types'

/**
 * The one place the concrete storage is chosen.
 *
 * Everything else asks for `Repositories` and gets whatever is provided here,
 * which is what makes the PocketBase dependency swappable — a different backend,
 * or a stub in a component test, replaces this file and nothing else.
 *
 * Runs after the `pocketbase` plugin because it reads `$pb`; Nuxt orders
 * client plugins alphabetically, and `pocketbase` sorts before `repositories`.
 * The dependency is real, so it is stated rather than left to that coincidence.
 */
export default defineNuxtPlugin({
  name: 'repositories',
  dependsOn: ['pocketbase'],
  setup() {
    // No auth state is threaded through: the repositories carry the caller's
    // identity implicitly, in the token the SDK attaches and the proxy forwards.
    // Scoping happens in PocketBase's API rules and in `ownership.pb.js`, not
    // in a filter this side of the wire.
    const repositories: Repositories = createPocketBaseRepositories(usePocketbase())

    return { provide: { repositories } }
  },
})
