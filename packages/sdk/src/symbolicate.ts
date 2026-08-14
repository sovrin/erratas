import type { ErratasEvent, SourceLine, StackFrame } from './types'

/**
 * Asking the host application's own server to make a minified frame readable.
 *
 * A browser cannot do this by itself, and the reason is worth stating plainly
 * because it looks like an implementation gap and is not: a source map the
 * browser can fetch is a source map anyone can fetch. "Private map, resolved in
 * the page" is a contradiction. The only party that can hold the map privately
 * and still know what the browser is running is the server that served the
 * bundle — so that is who gets asked.
 *
 * The map never leaves that server. What comes back is a handful of lines,
 * which the SDK attaches to the event exactly as `@erratas/sdk/node` does.
 *
 * Unlike the ingest payload, this is **not** a frozen contract. Both ends of it
 * ship in the same package version, so it can change whenever both change.
 */

/** What the SDK asks about: a position in a bundle, as the stack reported it. */
export interface SymbolicateRequestFrame {
  filename: string
  lineno: number
  colno?: number
}

/** What comes back, or null for a frame the server could not place. */
export interface SymbolicateResponseFrame {
  filename: string
  lineno: number
  colno?: number
  function?: string
  code: SourceLine[]
}

export interface SymbolicateRequest {
  frames: SymbolicateRequestFrame[]
}

export interface SymbolicateResponse {
  /** Positional: same length as the request, `null` where nothing resolved. */
  frames: (SymbolicateResponseFrame | null)[]
}

/**
 * Frames asked about per event.
 *
 * The top three, matching both `@erratas/sdk/node` and the number of frames
 * grouping fingerprints from. It also bounds what this can cost the host app's
 * server during a crash loop.
 */
const MAX_FRAMES = 3

/**
 * How long a report will wait for source before going without it.
 *
 * The request is same-origin and the server caches parsed maps, so a healthy
 * endpoint answers in a few milliseconds. This is the ceiling for an unhealthy
 * one — past it the event is sent unsymbolicated rather than held, because a
 * report that arrives plain beats a report that never arrives.
 */
const TIMEOUT_MS = 1_000

/** Positions remembered, so a crash loop asks once rather than once per report. */
const MAX_CACHED_FRAMES = 100

export type FrameCache = Map<string, SymbolicateResponseFrame | null>

function keyOf(frame: StackFrame): string {
  return `${frame.filename}:${frame.lineno}:${frame.colno ?? 0}`
}

/**
 * Resolves an event's top frames in place.
 *
 * Never rejects and never throws: every failure — a dead endpoint, a timeout, a
 * body that is not what we expected — leaves the event exactly as it arrived.
 * Reporting continues with less information, which is the only acceptable
 * failure mode for something on this path.
 *
 * Note what is deliberately absent: any reporting of *this* request's failures.
 * A symbolicate endpoint returning 500 on every error, reported through the SDK,
 * is the recursion that takes an application down.
 */
export async function symbolicateEvent(
  event: ErratasEvent,
  url: string,
  cache: FrameCache,
): Promise<void> {
  try {
    const frames = event.exception?.frames
    if (!frames || frames.length === 0) return
    if (typeof fetch === 'undefined') return

    const candidates = frames.slice(0, MAX_FRAMES)
    const wanted: { index: number; frame: SymbolicateRequestFrame }[] = []

    candidates.forEach((frame, index) => {
      if (typeof frame.filename !== 'string' || typeof frame.lineno !== 'number') return

      const cached = cache.get(keyOf(frame))
      if (cached !== undefined) {
        if (cached) apply(frames, index, cached)
        return
      }

      wanted.push({
        index,
        frame: { filename: frame.filename, lineno: frame.lineno, colno: frame.colno },
      })
    })

    if (wanted.length === 0) return

    const answer = await post(url, { frames: wanted.map((entry) => entry.frame) })
    if (!answer) return

    wanted.forEach((entry, position) => {
      const resolved = answer.frames[position] ?? null
      remember(cache, keyOf(candidates[entry.index]!), resolved)
      if (resolved) apply(frames, entry.index, resolved)
    })
  } catch {
    // Reporting proceeds without source. Never rethrow from here.
  }
}

/**
 * Replaces the frame's location along with its code.
 *
 * Both or neither. Leaving `bundle.js:1:48213` above a listing of TypeScript
 * would give the panel a header and a gutter that disagree — and grouping keys
 * on the frame's function and file, so a half-applied frame would group apart
 * from a fully applied one and split one bug into two issues.
 */
function apply(frames: StackFrame[], index: number, resolved: SymbolicateResponseFrame): void {
  const frame = frames[index]
  if (!frame) return

  frame.filename = resolved.filename
  frame.lineno = resolved.lineno
  frame.colno = resolved.colno ?? frame.colno
  if (resolved.function) frame.function = resolved.function
  frame.code = resolved.code
}

function remember(cache: FrameCache, key: string, value: SymbolicateResponseFrame | null): void {
  if (cache.size >= MAX_CACHED_FRAMES) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(key, value)
}

async function post(url: string, body: SymbolicateRequest): Promise<SymbolicateResponse | null> {
  // `AbortSignal.timeout` is not everywhere the SDK runs, and a missing timeout
  // would mean an unhealthy endpoint holding a report open indefinitely — so the
  // caller races this against its own timer as well.
  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(TIMEOUT_MS)
      : undefined

  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    // Same-origin by construction — this is the host app's own server, not
    // ingest — so a JSON content type costs no preflight here.
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    signal,
  })

  if (!response.ok) return null

  const parsed: unknown = await response.json()
  return isResponse(parsed) ? parsed : null
}

/** The server is the host app's, not ours; its answer is still checked. */
function isResponse(value: unknown): value is SymbolicateResponse {
  if (typeof value !== 'object' || value === null) return false
  const frames = (value as { frames?: unknown }).frames
  if (!Array.isArray(frames)) return false

  return frames.every(
    (frame) =>
      frame === null ||
      (typeof frame === 'object' &&
        typeof (frame as SymbolicateResponseFrame).filename === 'string' &&
        typeof (frame as SymbolicateResponseFrame).lineno === 'number' &&
        Array.isArray((frame as SymbolicateResponseFrame).code)),
  )
}

export { TIMEOUT_MS as SYMBOLICATE_TIMEOUT_MS }
