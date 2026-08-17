import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { DEFAULT_CONTEXT_LINES, sliceSourceLines } from '../sourceLines'
import type { ErratasEvent, SourceLine, StackFrame } from '../types'
import { resolveViaSourceMap, type SourceMapCache } from './sourceMap'

/**
 * Source context for Node, read from the disk the code is running off.
 *
 * This is the cheapest honest version of the feature and the reason to build it
 * first. There is no map to fetch, no round trip, no build to match: the process
 * that threw has the file open a syscall away, and by definition it is the exact
 * file that threw. The drift that makes after-the-fact symbolication untrustworthy
 * cannot happen here.
 *
 * Two ways it finds the source, tried in order, because real deployments differ:
 *
 * 1. **The file on disk.** Covers anything running from its own sources — `tsx`,
 *    `ts-node`, plain JS, or a `tsc` build shipped alongside `src/`. If Node's
 *    own source map support is on (`--enable-source-maps`), frames already name
 *    the original `.ts` file and this is a straight read.
 * 2. **The build's source map.** Covers the common deployment where only `dist/`
 *    ships: the frame points into a minified bundle, `sliceSourceLines` refuses
 *    to quote it, and the original text is recovered from the adjacent `.map`'s
 *    `sourcesContent` instead. The map stays on the server; eleven lines leave.
 *
 * The two interact, and one combination produces nothing: **shipping only `dist/`
 * while running with `--enable-source-maps`.** The flag makes Node rewrite frames
 * to original paths before this hook sees them, so (1) looks for a file that was
 * never deployed and (2) has nothing left to work from — a `.ts` that does not
 * exist has no `.ts.map` beside it, and the bundle that does have one is no
 * longer named anywhere. Leave the flag off in that deployment and (2) resolves
 * properly. The failure is quiet and plausible-looking: locations are right, code
 * is just missing.
 *
 * When (2) resolves, the frame is **rewritten** to the original file, line and
 * function — otherwise the panel would show `bundle.js:1:48213` above a listing
 * of TypeScript, with gutter numbers matching neither. Worth knowing before
 * turning this on: grouping fingerprints from frame function and file, so events
 * reported with resolved frames group separately from the minified ones the same
 * bug produced before. Existing issues split once, at the deploy that enables it.
 *
 * The SDK deliberately does **not** call `process.setSourceMapsEnabled(true)` for
 * you. It is a process-wide change to how every stack in the application renders,
 * including stacks this library never sees — the same class of decision as
 * installing an `uncaughtException` handler, which this SDK also refuses to make
 * on its host's behalf.
 */

/**
 * Frames given context, from the top down.
 *
 * Three, matching the number of frames grouping fingerprints from — the top of a
 * stack is where the bug is, and the rest is how you got there. It also keeps
 * the payload honest: three windows of eleven lines is a kilobyte or so, against
 * a 60KB event ceiling. Context for all fifty frames would be most of the budget
 * spent on frames nobody reads.
 */
const DEFAULT_FRAME_COUNT = 3

/**
 * Files larger than this are not read.
 *
 * A hand-written source file is measured in kilobytes; anything past a megabyte
 * is a bundle, a generated artifact or a vendored blob, and reading it into
 * memory inside an error path to slice eleven lines out is a bad trade even when
 * it would work.
 */
const MAX_FILE_BYTES = 1024 * 1024

/**
 * Distinct files remembered.
 *
 * A crash loop hits the same handful of files forever, so the cache turns
 * repeated reports into one read each. Bounded because the keys are paths from
 * stack traces and an unbounded map keyed by anything a stack can contain is a
 * slow leak in a long-lived process.
 */
const MAX_CACHED_FILES = 64

export interface SourceContextOptions {
  /** How many frames from the top get context. Defaults to 3. */
  frames?: number
  /** Lines before the offending one. Defaults to 5. */
  before?: number
  /** Lines after the offending one. Defaults to 5. */
  after?: number
}

/**
 * Builds a `beforeSend` hook that attaches source context.
 *
 * ```ts
 * import { init } from '@erratas/sdk'
 * import { withSourceContext } from '@erratas/sdk/node'
 *
 * init({ dsn: process.env.ERRATAS_DSN!, beforeSend: withSourceContext() })
 * ```
 *
 * Compose it by calling it yourself if you already have a hook — scrubbing
 * should run *after* this, so that whatever you redact from a payload you also
 * redact from the lines of source attached to it:
 *
 * ```ts
 * const addSource = withSourceContext()
 * init({ dsn, beforeSend: (event) => scrub(addSource(event)) })
 * ```
 */
export function withSourceContext(
  options: SourceContextOptions = {},
): (event: ErratasEvent) => ErratasEvent {
  const frameCount = positiveInteger(options.frames, DEFAULT_FRAME_COUNT)
  const before = positiveInteger(options.before, DEFAULT_CONTEXT_LINES)
  const after = positiveInteger(options.after, DEFAULT_CONTEXT_LINES)

  // Per-hook rather than module-level, so two clients in one process (tests,
  // a monorepo) do not share a cache, and closing one frees it.
  const files = new Map<string, string | null>()
  const maps: SourceMapCache = new Map()

  return function addSourceContext(event: ErratasEvent): ErratasEvent {
    // Wrapped whole. This runs inside the reporting path of an application that
    // is already failing; a permissions error or an exotic path must cost the
    // report its code, never the report itself.
    try {
      const frames = event.exception?.frames
      if (!frames || frames.length === 0) return event

      let changed = false
      const withCode = frames.map((frame, index) => {
        if (index >= frameCount) return frame
        const resolved = contextFor(frame, { files, maps }, { before, after })
        if (!resolved) return frame
        changed = true
        return { ...frame, ...resolved }
      })

      if (!changed) return event

      // A new event rather than a mutated one: `beforeSend` hooks compose, and a
      // hook that edits its argument in place makes the order they run in matter
      // in ways nobody can see from the call site.
      return { ...event, exception: { ...event.exception!, frames: withCode } }
    } catch {
      return event
    }
  }
}

interface Caches {
  files: Map<string, string | null>
  maps: SourceMapCache
}

/**
 * The patch to apply to a frame: always `code`, plus the original location when
 * it took a source map to find it.
 */
function contextFor(
  frame: StackFrame,
  caches: Caches,
  window: { before: number; after: number },
): Partial<StackFrame> | null {
  const path = toReadablePath(frame.filename)
  if (!path || typeof frame.lineno !== 'number') return null

  const onDisk = readCached(path, caches.files)
  if (onDisk !== null) {
    const lines = sliceSourceLines(onDisk, frame.lineno, window)
    // Non-empty means the file was real source. Empty means it was a bundle, so
    // fall through and let the map answer instead.
    if (lines.length > 0) return { code: lines }
  }

  return viaSourceMap(frame, path, caches, window)
}

function viaSourceMap(
  frame: StackFrame,
  path: string,
  caches: Caches,
  window: { before: number; after: number },
): Partial<StackFrame> | null {
  const position = resolveViaSourceMap(
    path,
    frame.lineno as number,
    typeof frame.colno === 'number' ? frame.colno : 1,
    caches.maps,
  )
  if (!position) return null

  const lines: SourceLine[] = sliceSourceLines(position.content, position.line, window)
  if (lines.length === 0) return null

  // The location is rewritten along with the code. Leaving the minified one in
  // place would put `bundle.js:1:48213` above a listing of TypeScript whose
  // gutter numbers agree with neither — see the note on grouping above.
  return {
    code: lines,
    filename: position.source,
    lineno: position.line,
    colno: position.column,
    // Only when the map recorded one; a minified `e.create` is worse than
    // nothing, but so is erasing a name we could not improve on.
    function: position.name ?? frame.function,
  }
}

/**
 * A filesystem path for a frame, or null if there cannot be one.
 *
 * Stack frames name three kinds of thing and only one of them is a file. Node's
 * internals arrive as `node:internal/process/task_queues`, ESM frames arrive as
 * `file:///abs/path.js` URLs, and everything else is already a path. Filtering
 * the first two here keeps a failed `readFileSync` out of the hot path for the
 * frames that are guaranteed to fail — every stack has some.
 */
function toReadablePath(filename: string | undefined): string | null {
  if (typeof filename !== 'string' || filename === '') return null
  if (filename.startsWith('node:')) return null

  if (filename.startsWith('file://')) {
    try {
      return fileURLToPath(filename)
    } catch {
      return null
    }
  }

  // Relative paths, `<anonymous>`, `eval at …` and native frames have no file to
  // resolve against — the process's cwd is not where the stack was written.
  return filename.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(filename) ? filename : null
}

/** Reads a file once. `null` is cached too — a miss must not be retried per event. */
function readCached(path: string, cache: Map<string, string | null>): string | null {
  const hit = cache.get(path)
  if (hit !== undefined) return hit

  let source: string | null = null
  try {
    // Size is checked before reading rather than after: the point is to not pull
    // a megabyte bundle into memory, and reading it to find out how big it was
    // would have already done that.
    if (statSync(path).size <= MAX_FILE_BYTES) source = readFileSync(path, 'utf8')
  } catch {
    source = null
  }

  // Plain eviction of the oldest key. An LRU would be better and is not worth
  // the code: the working set of a crash loop is a handful of files, so this
  // only ever runs on a stack that walked through more than 64 of them.
  if (cache.size >= MAX_CACHED_FILES) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }

  cache.set(path, source)
  return source
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : fallback
}
