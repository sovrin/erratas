import type { SourceLine } from './types'

/**
 * Cutting a readable window of source out of a file.
 *
 * Pure and filesystem-free on purpose: this is the half worth testing, and it is
 * the half both producers share. Node slices from a file it read off disk; the
 * browser path will eventually slice from a map's `sourcesContent` on the app's
 * own server. Same rules, same output, one place to get them right.
 */

/** Lines either side of the offending one. Enough for context, small enough to send. */
export const DEFAULT_CONTEXT_LINES = 5

/**
 * Longer than this and a line is not source, it is a minified bundle.
 *
 * Matched to ingest's own per-line clamp, so nothing is sent that would arrive
 * truncated. The threshold does double duty, and the second job is the important
 * one: a minified file is a single line of hundreds of kilobytes, and slicing
 * "the lines around line 1" out of it yields 400 characters of `t.prototype.n=
 * function(e){...` — noise wearing the costume of source. Refusing to produce it
 * is deliberate. A frame with no code renders as just its location, which is
 * honest; a frame with unreadable code wastes the reader's attention and the
 * payload budget both.
 *
 * The cost is that a legitimately enormous line — a long string literal, a
 * generated table — loses its context too. That is a fair trade for never
 * rendering soup.
 */
export const MAX_LINE_CHARS = 400

export interface SliceOptions {
  /** Lines before the target. Defaults to `DEFAULT_CONTEXT_LINES`. */
  before?: number
  /** Lines after the target. Defaults to `DEFAULT_CONTEXT_LINES`. */
  after?: number
}

/**
 * Returns the window around `lineno` (1-based), or `[]` when there is nothing
 * worth showing.
 *
 * Never throws: it runs while an application is already failing, and a bad line
 * number is a reason to send less, never a reason to raise a second error.
 */
export function sliceSourceLines(
  source: string,
  lineno: number,
  options: SliceOptions = {},
): SourceLine[] {
  if (typeof source !== 'string' || source === '') return []
  if (!Number.isInteger(lineno) || lineno < 1) return []

  const before = normaliseCount(options.before)
  const after = normaliseCount(options.after)

  // `split` rather than a streaming scan: the caller has already decided this
  // file is small enough to hold in memory (it read the whole thing), and a
  // bundle guard upstream keeps that true.
  const lines = source.split('\n')
  if (lineno > lines.length) return []

  // The offending line decides whether any of this is worth sending. Checking
  // it before building the window means a minified file costs one lookup rather
  // than eleven substring operations and an array.
  const target = stripCarriageReturn(lines[lineno - 1] ?? '')
  if (target.length > MAX_LINE_CHARS) return []

  const from = Math.max(1, lineno - before)
  const to = Math.min(lines.length, lineno + after)

  const window: SourceLine[] = []
  for (let n = from; n <= to; n++) {
    const text = stripCarriageReturn(lines[n - 1] ?? '')
    const line: SourceLine = {
      n,
      // Neighbours are truncated rather than dropped: losing the tail of a long
      // line costs nothing, but a gap in the middle of a window would misalign
      // what the reader is scanning against the numbers in the gutter.
      text: text.length > MAX_LINE_CHARS ? text.slice(0, MAX_LINE_CHARS) : text,
    }
    if (n === lineno) line.err = true
    window.push(line)
  }

  return window
}

/** A file that ends without a trailing newline still splits cleanly; CRLF does not. */
function stripCarriageReturn(text: string): string {
  return text.endsWith('\r') ? text.slice(0, -1) : text
}

function normaliseCount(value: number | undefined): number {
  if (!Number.isInteger(value) || (value as number) < 0) return DEFAULT_CONTEXT_LINES
  return value as number
}
