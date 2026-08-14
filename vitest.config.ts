import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    // happy-dom for everything: the SDK is browser-first and its tests need
    // window, document and navigator to exist.
    environment: 'happy-dom',
    include: [
      'shared/**/*.test.ts',
      'server/**/*.test.ts',
      'packages/**/test/**/*.test.ts',
      // The PocketBase hooks run in goja, but their pure parts (the grouping
      // rule above all) are too consequential to leave untested.
      'docker/pocketbase/hooks/*.test.ts',
    ],
  },
})
