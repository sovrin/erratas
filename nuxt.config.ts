import tailwindcss from '@tailwindcss/vite'

import pkg from './package.json'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ['tunnel.kamlowski.com'],
    },
  },

  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  ssr: false,
  css: ['~/assets/css/main.css'],

  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        // One face for the whole app. erratas shows stack traces, source lines
        // and DSNs — everything is code, so everything is monospace.
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap',
        },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-180.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
        },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'erratas' },
        { name: 'theme-color', content: '#060606' },
      ],
    },
  },

  runtimeConfig: {
    pocketbaseUrl: process.env.POCKETBASE_URL || 'http://localhost:8090',
    public: {
      allowRegistration:
        process.env.ALLOW_REGISTRATION !== 'false' && process.env.ALLOW_REGISTRATION !== '0',
      appVersion: pkg.version,
      // Host the SDK is told to report to, as it appears in a DSN. Deliberately
      // separate from the URL this dashboard is served on: an instance behind a
      // proxy, or one with a dedicated ingest hostname, still has to hand out a
      // DSN that resolves from a customer's application rather than from this
      // browser tab. Empty means "use whatever origin the dashboard is on".
      ingestHost: process.env.NUXT_PUBLIC_INGEST_HOST || '',
    },
  },

  modules: ['@nuxt/eslint', 'shadcn-nuxt'],

  shadcn: {
    prefix: '',
    componentDir: './app/components/ui',
  },
})
