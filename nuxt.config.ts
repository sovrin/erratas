import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// erratas is a module of nexitas: a Nuxt layer that nexitas extends, as its modules.json lists it.
// The owner's sign-in, the /api guard, live updates, the database, projects and the page shell are
// nexitas'; this layer adds the issues, their pages, ingest and the browser SDK.
// Everything here resolves from this folder, since the app around it is nexitas.
const root = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2026-09-06',
  // nexitas allows its own files and aequitas'; these are erratas' own.
  vite: { server: { fs: { allow: [root] } } },
  // The browser SDK is bundled on its own (public/v1/errors.js): built with every build of nexitas
  // that includes erratas, from wherever it runs.
  hooks: {
    'build:before': () => {
      execFileSync('pnpm', ['build:sdk'], { cwd: root, stdio: 'inherit' })
    },
  },
  routeRules: {
    // Other sites import it as a module script, which browsers fetch with CORS. It is public
    // code; a short cache lets a fix reach every app within minutes.
    '/v1/errors.js': {
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' },
    },
  },
})
