import type { StackFrame } from './types'

/**
 * `Error.prototype.stack` is not standardised. Every engine formats it
 * differently, none of them promise not to change it, and a bundler will have
 * rewritten the names and paths in it before we ever see it. So: parse
 * best-effort, keep whatever comes out, and never throw — a half-read stack is
 * still far better than no stack, and an exception raised while *reporting* an
 * exception is the worst outcome available.
 */

/** V8 / Chrome / Node: `    at fnName (file:line:col)` — with or without the name. */
const V8_LINE = /^\s*at (?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+)|([^)]+))\)?\s*$/

/** Firefox / Safari: `fnName@file:line:col`, and `@file:line:col` for anonymous. */
const SPIDERMONKEY_LINE = /^\s*(?:(.*?)@)?(.+?):(\d+):(\d+)\s*$/

/**
 * Frames beyond this are dropped. Deep recursion produces stacks with thousands
 * of identical frames, and the interesting part of any stack is its top — this
 * caps the payload without costing anything a reader would have used.
 */
const MAX_FRAMES = 50

export function parseStack(stack: unknown): StackFrame[] {
  if (typeof stack !== 'string' || stack === '') return []

  const frames: StackFrame[] = []

  for (const raw of stack.split('\n')) {
    if (frames.length >= MAX_FRAMES) break

    const line = raw.trim()
    // The first line of a V8 stack is "TypeError: message", not a frame. Skip
    // anything that does not look like one instead of pattern-matching the
    // header, which can itself contain newlines from a multi-line message.
    if (line === '' || !(line.startsWith('at ') || line.includes('@'))) continue

    const frame = parseV8(line) ?? parseSpiderMonkey(line)
    if (frame) frames.push(frame)
  }

  return frames
}

function parseV8(line: string): StackFrame | null {
  const match = V8_LINE.exec(line)
  if (!match) return null

  const [, fn, file, lineno, colno, bare] = match

  // `at <anonymous>` and `at native` have no location at all.
  if (bare !== undefined) return clean({ function: fn, filename: bare })

  return clean({
    function: fn,
    filename: file,
    lineno: toInt(lineno),
    colno: toInt(colno),
  })
}

function parseSpiderMonkey(line: string): StackFrame | null {
  const match = SPIDERMONKEY_LINE.exec(line)
  if (!match) return null

  const [, fn, file, lineno, colno] = match
  return clean({
    function: fn,
    filename: file,
    lineno: toInt(lineno),
    colno: toInt(colno),
  })
}

function toInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

/** Drops empty keys, so a frame carries only what was actually read. */
function clean(frame: StackFrame): StackFrame | null {
  const result: StackFrame = {}
  if (frame.function) result.function = frame.function
  if (frame.filename) result.filename = frame.filename
  if (frame.lineno !== undefined) result.lineno = frame.lineno
  if (frame.colno !== undefined) result.colno = frame.colno
  return Object.keys(result).length ? result : null
}
