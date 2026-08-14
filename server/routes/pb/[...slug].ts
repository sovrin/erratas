// Reverse-proxies every PocketBase call the app makes (auth, records, files,
// realtime) through our own origin, so the browser never talks to
// PocketBase directly — it only needs to be reachable from this server.
export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const slug = getRouterParam(event, 'slug') || ''
  const search = getRequestURL(event).search
  return proxyRequest(event, `${config.pocketbaseUrl}/${slug}${search}`)
})
