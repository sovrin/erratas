import PocketBase, { LocalAuthStore } from 'pocketbase'

import type { Users } from '#shared/pocketbase/tsSchema'

// Named so `repositories.client.ts` can declare it as a dependency rather than
// relying on plugins happening to run in alphabetical order.
export default defineNuxtPlugin({
  name: 'pocketbase',
  setup() {
    const pb = new PocketBase('/pb', new LocalAuthStore('pb_auth_erratas'))

    const authUser = useState<Users | null>('auth-user', () => pb.authStore.record as Users | null)

    pb.authStore.onChange(() => {
      authUser.value = pb.authStore.record as Users | null
    }, true)

    return {
      provide: { pb },
    }
  },
})
