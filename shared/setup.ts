// What the owner copies to make an app report: its DSN, the snippet that installs the SDK, and a
// command that sends a test event. Each has to agree exactly with the SDK, which reads the DSN
// and derives the ingest URL from it; tests round-trip them through the SDK's own parser.

/** `https://<publicKey>@<host>/<stackId>`, Sentry's shape: the last segment names the stack. The
 *  origin is this app's, so http only when the app itself runs on http. */
export function buildDsn(origin: string, publicKey: string, stackId: string) {
  const url = new URL(origin)
  return `${url.protocol}//${publicKey}@${url.host}${url.pathname.replace(/\/+$/, '')}/${stackId}`
}

/** Where the SDK posts: the stack in the path, the key in the query string, since a header would
 *  make a cross-origin post need a preflight, and sendBeacon cannot set one at all. */
export function buildIngestUrl(origin: string, publicKey: string, stackId: string) {
  return `${origin.replace(/\/+$/, '')}/v1/errors/${stackId}?erratas_key=${encodeURIComponent(publicKey)}`
}

/** Platforms that run on a server, where source context is a file read away. */
const SERVER_PLATFORMS = ['node', 'bun', 'deno', 'express', 'fastify', 'nitro']

/** The snippet for a stack's platform: the npm package on a server, the script this app serves in
 *  a browser (and for any platform nobody recognised, since it is the SDK that exists). */
export function snippetFor(platform: string, dsn: string, origin: string) {
  const server = SERVER_PLATFORMS.some((name) => platform.toLowerCase().includes(name))
  // Source context needs nothing mounted on a server: the file, or the build's map, is on the
  // same disk. With only dist/ deployed, --enable-source-maps must stay off, or Node rewrites
  // frames to files that were never deployed.
  if (server)
    return `npm install @erratas/sdk

import { init, captureException } from '@erratas/sdk'
import { withSourceContext } from '@erratas/sdk/node'

init({
  dsn: '${dsn}',
  // The lines around each throw. If you deploy only your build output,
  // leave --enable-source-maps off and the build's .map is used.
  beforeSend: withSourceContext(),
})

// Node is not instrumented: an uncaughtException handler would keep your
// process alive after a crash. Report what you catch.
captureException(error)`
  // symbolicate is offered commented out: it needs an endpoint on the app's own server first.
  return `<script type="module">
  import { init } from '${origin.replace(/\/+$/, '')}/v1/errors.js'

  init({
    dsn: '${dsn}',
    // Minified frames? Mount createSymbolicateHandler() from
    // '@erratas/sdk/node' on your own server and point at it.
    // symbolicate: '/__erratas/symbolicate',
  })
</script>`
}

/** The smallest body ingest accepts: a version, and something to say. */
const TEST_EVENT = '{"v":1,"message":"test event from curl"}'

/** Proves the pipe works: if this lands, ingest is reachable and the DSN right, so a silent app
 *  is the app's problem. text/plain, like the SDK, so it tests the same request. */
export function testEventCommand(ingestUrl: string) {
  return `curl -X POST \\
  '${ingestUrl}' \\
  -H 'content-type: text/plain' \\
  -d '${TEST_EVENT}'`
}
