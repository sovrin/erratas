import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// The tests import the core as the app does, through #nexitas (see nuxt.config.ts). happy-dom for
// all: the SDK is browser-first, and its tests need window, document and navigator.
export default defineConfig({
  resolve: {
    alias: { '#nexitas': resolve(import.meta.dirname, process.env.NEXITAS_DIR ?? '../nexitas') },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts', 'packages/sdk/test/**/*.test.ts'],
    testTimeout: 15_000,
  },
})
