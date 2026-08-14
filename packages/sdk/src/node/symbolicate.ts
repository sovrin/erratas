import { join, resolve } from 'node:path'

import { DEFAULT_CONTEXT_LINES, sliceSourceLines } from '../sourceLines'
import type {
  SymbolicateRequest,
  SymbolicateRequestFrame,
  SymbolicateResponse,
  SymbolicateResponseFrame,
} from '../symbolicate'
import { isInside, resolveViaSourceMap, type SourceMapCache } from './sourceMap'

/**
 * The server half of browser symbolication.
 *
 * A browser cannot read its own source map privately — anything the page can
 * fetch, anyone can fetch — so the only party that can hold the map and still
 * know what the browser is running is the server that served the bundle. This
 * turns `bundle-a1b2c3d4.js:1:48213` into eleven lines of the original file. The
 * map stays here; the lines go back.
 *
 * # This endpoint hands out your source code
 *
 * That is what it is for, and it means the handler is a security boundary rather
 * than a convenience. It takes a filename chosen by whoever is calling and
 * answers with file contents, which is an arbitrary-file-read primitive if built
 * naively. Three properties stop it being one, and none of them is optional:
 *
 * 1. **The requested file is never read for its contents.** It is used only to
 *    locate a source map; every line returned comes out of a map's
 *    `sourcesContent`. A path that is not a built asset with a map beside it
 *    yields nothing, whatever it points at.
 * 2. **Everything is confined to `root`.** The asset path and the map path are
 *    both resolved and checked, so neither `../../etc/passwd` nor a
 *    `sourceMappingURL` comment pointing outside can escape.
 * 3. **Only a window is ever returned** — a few lines per frame, a few frames per
 *    request. Reconstructing a file takes many calls, which a rate limit in front
 *    of this makes impractical.
 *
 * What none of that changes: anyone who can reach this endpoint can read parts of
 * your original source. It is mounted on your own origin, so gate it as that
 * deserves — authentication, a rate limit, or an internal-only route. Deciding
 * that is the price of keeping the map off the error logger, which is the trade
 * this whole design is making.
 */

/** Frames answered per request. Matches what the SDK asks for; bounds the cost. */
const MAX_FRAMES = 3

export interface SymbolicateHandlerOptions {
  /**
   * Directory holding the built assets and their `.map` files — for example
   * `.output/public/_nuxt` or `dist/assets`. Nothing outside it is readable.
   */
  root: string
  /**
   * URL path prefix that corresponds to `root`. A frame at
   * `https://app.example.com/assets/app-abc.js` with `basePath: '/assets'`
   * resolves to `<root>/app-abc.js`. Defaults to `/`.
   */
  basePath?: string
  /** Lines before the offending one. Defaults to 5. */
  before?: number
  /** Lines after the offending one. Defaults to 5. */
  after?: number
}

/**
 * Resolves frames. The transport-free core, so it can be mounted on anything and
 * tested without one.
 */
export function createSymbolicateResolver(
  options: SymbolicateHandlerOptions,
): (frames: SymbolicateRequestFrame[]) => (SymbolicateResponseFrame | null)[] {
  const root = resolve(options.root)
  const basePath = normaliseBase(options.basePath)
  const before = options.before ?? DEFAULT_CONTEXT_LINES
  const after = options.after ?? DEFAULT_CONTEXT_LINES
  const maps: SourceMapCache = new Map()

  return function resolveFrames(frames) {
    if (!Array.isArray(frames)) return []

    return frames.slice(0, MAX_FRAMES).map((frame) => {
      try {
        return resolveFrame(frame)
      } catch {
        // One unresolvable frame must not fail the others, and must never
        // surface as a 500 that the SDK might interpret as worth retrying.
        return null
      }
    })
  }

  function resolveFrame(frame: SymbolicateRequestFrame): SymbolicateResponseFrame | null {
    if (!frame || typeof frame.filename !== 'string') return null
    if (typeof frame.lineno !== 'number' || !Number.isFinite(frame.lineno)) return null

    const assetPath = toAssetPath(frame.filename)
    if (!assetPath) return null

    const position = resolveViaSourceMap(
      assetPath,
      frame.lineno,
      typeof frame.colno === 'number' ? frame.colno : 1,
      maps,
      // Confines the *map* as well as the asset — a `sourceMappingURL` comment
      // is content, and content in a public directory is not trusted here.
      root,
    )
    if (!position) return null

    const code = sliceSourceLines(position.content, position.line, { before, after })
    if (code.length === 0) return null

    return {
      filename: position.source,
      lineno: position.line,
      colno: position.column,
      function: position.name,
      code,
    }
  }

  /**
   * A frame's filename is a URL as the browser saw it. This turns it into a path
   * inside `root`, or refuses.
   *
   * `URL` parsing does the first half of the work: it normalises `..` segments
   * and strips the query and hash, so `/assets/../../etc/passwd` is already
   * collapsed before it is looked at. The containment check is what makes that a
   * guarantee rather than a hope.
   */
  function toAssetPath(filename: string): string | null {
    let pathname: string
    try {
      // The base only matters for relative filenames; it is never used to reach
      // anything, since only the pathname survives.
      pathname = decodeURIComponent(new URL(filename, 'http://localhost').pathname)
    } catch {
      return null
    }

    // A NUL byte truncates a path in some syscalls; refuse rather than normalise.
    if (pathname.includes('\0')) return null
    if (basePath && !pathname.startsWith(basePath)) return null

    const relative = basePath ? pathname.slice(basePath.length) : pathname
    const candidate = resolve(join(root, relative))

    return isInside(candidate, root) ? candidate : null
  }
}

/** `/assets/` and `assets` both become `/assets`; `/` and undefined become ``. */
function normaliseBase(basePath: string | undefined): string {
  if (!basePath || basePath === '/') return ''
  const withLeading = basePath.startsWith('/') ? basePath : `/${basePath}`
  return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading
}

/**
 * A `Request` → `Response` handler, for anything speaking web standards — Nitro,
 * Hono, Next, Bun, Deno, a plain `fetch` server.
 *
 * ```ts
 * // server/routes/__erratas/symbolicate.post.ts  (Nuxt/Nitro)
 * const handler = createSymbolicateHandler({ root: '.output/public/_nuxt', basePath: '/_nuxt' })
 * export default defineEventHandler((event) => handler(toWebRequest(event)))
 * ```
 *
 * Errors answer `400`, never `5xx`: this sits in the SDK's reporting path, and a
 * server error is the one status a client might reasonably retry.
 */
export function createSymbolicateHandler(
  options: SymbolicateHandlerOptions,
): (request: Request) => Promise<Response> {
  const resolveFrames = createSymbolicateResolver(options)

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ frames: [] }, 405)

    let body: SymbolicateRequest
    try {
      body = (await request.json()) as SymbolicateRequest
    } catch {
      return json({ frames: [] }, 400)
    }

    if (!body || !Array.isArray(body.frames)) return json({ frames: [] }, 400)

    return json({ frames: resolveFrames(body.frames) }, 200)
  }
}

function json(body: SymbolicateResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // Answers describe one build's source and must not be reused or shared.
      'cache-control': 'no-store',
    },
  })
}
