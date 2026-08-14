/**
 * The public door for event ingest.
 *
 * `server/` is otherwise only the `/pb` proxy, and this is the one deliberate
 * exception: PocketBase binds `127.0.0.1` and the Nuxt container is the only
 * thing listening publicly, so the host in a DSN resolves here no matter what.
 * The question was never "hook or Nitro" — it was how much Nitro does. This
 * does the least it can: CORS, a size ceiling, and a forward. Every decision
 * about the event itself is made in `ingest.pb.js`, which also re-checks the
 * size, because the `/pb` proxy means a browser can reach that hook directly
 * and nothing here can be assumed to have run.
 *
 * The URL shape is frozen — `POST /api/{stackId}/store/?erratas_key=…` — because
 * released SDK versions sit inside applications that will never be updated.
 */
import { Buffer } from 'node:buffer'

/** Matches `MAX_EVENT_BYTES` in the hook, with slack for the truncation check. */
const MAX_BODY_BYTES = 200 * 1024

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // A "simple" cross-origin POST (text/plain, no custom headers) is sent
  // *without* a preflight — which is exactly why the SDK sends one. But the
  // browser still hides the response from the page unless this header is
  // present, and a blocked response surfaces in the reporting app's console as
  // a CORS error that gets filed as a bug in their code, not ours.
  //
  // `*` rather than an allowlist: a DSN is public and grants write only, so
  // there is no origin whose reports we are in a position to distrust more than
  // another's. Abuse is answered with rate limits, not with an Origin header
  // that anybody can set.
  setResponseHeaders(event, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    // h3 types this one as a number rather than a header string.
    'access-control-max-age': 86400,
    // The response says nothing an intermediary should keep.
    'cache-control': 'no-store',
  })

  // Nothing the SDK sends triggers a preflight today, but a future one might —
  // and answering OPTIONS is cheap insurance against that silently costing
  // every reporting app a doubled request.
  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return null
  }

  if (event.method !== 'POST') {
    setResponseStatus(event, 405)
    return { error: 'method not allowed' }
  }

  const stackId = getRouterParam(event, 'stackId')
  const key = getQuery(event).erratas_key
  if (!stackId || typeof key !== 'string' || !key) {
    setResponseStatus(event, 400)
    return { error: 'missing stack or key' }
  }

  // Read as text, not JSON: the body arrives labelled `text/plain` so the
  // request stays CORS-simple, so `readBody` would hand back a string anyway —
  // and parsing here would only mean parsing twice.
  const body = await readRawBody(event, 'utf8')
  if (!body) {
    setResponseStatus(event, 400)
    return { error: 'empty body' }
  }
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    setResponseStatus(event, 413)
    return { error: 'event too large' }
  }

  try {
    const response = await $fetch.raw<{ id?: string; error?: string }>(
      `${config.pocketbaseUrl}/api/ingest/${encodeURIComponent(stackId)}`,
      {
        method: 'POST',
        query: { erratas_key: key },
        body,
        headers: { 'content-type': 'text/plain' },
        // Statuses are the hook's answer to the caller, not a transport
        // failure, so they are passed through rather than thrown.
        ignoreResponseError: true,
      },
    )
    setResponseStatus(event, response.status)
    return response._data
  } catch {
    // PocketBase unreachable. 502 rather than 500: the SDK drops the report
    // either way, but the distinction is the difference between "erratas is
    // down" and "erratas is broken" when someone reads the logs.
    setResponseStatus(event, 502)
    return { error: 'ingest unavailable' }
  }
})
