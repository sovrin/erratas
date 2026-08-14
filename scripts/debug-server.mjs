// Serves examples/debug-app on its own port.
//
// A separate origin on purpose. The SDK's whole job is to run inside *somebody
// else's* application, and the wire format is shaped by that: the key rides in
// the query string and the JSON is labelled text/plain so a cross-origin POST
// stays CORS-"simple" and skips the preflight. Serving this page from the
// dashboard's own origin would make all of that untestable, because same-origin
// requests never exercise any of it.
import { createReadStream, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../examples/debug-app')
const SDK_BUNDLE = resolve(import.meta.dirname, '../packages/sdk/dist/index.mjs')
const PORT = Number(process.env.DEBUG_PORT || 3001)

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
}

if (!existsSync(SDK_BUNDLE)) {
  console.error('The SDK is not built.\n\n  npm run sdk:build\n')
  process.exit(1)
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  // The page imports the SDK as a module. Mapping it here rather than copying
  // the bundle keeps this testing whatever was last built, not a stale copy.
  if (url.pathname === '/sdk.mjs') return send(res, SDK_BUNDLE)

  const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  // normalize() collapses `..` before the join, so a crafted path cannot climb
  // out of ROOT. This only ever serves a local debug page, but a static server
  // that can be talked into reading /etc/passwd is not worth writing twice.
  const file = join(ROOT, normalize(relative))
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    return res.end('not found')
  }

  send(res, file)
})

function send(res, file) {
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  createReadStream(file).pipe(res)
}

server.listen(PORT, () => {
  console.log(`debug reporter on http://localhost:${PORT}`)
  console.log("paste a DSN from the dashboard's setup panel to start reporting")
})
