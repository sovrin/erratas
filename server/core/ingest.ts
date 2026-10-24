// Turning a reported event into what an issue stores. Everything here treats its input as
// hostile: a JSON blob posted by a stranger's browser or server, with only this file between it
// and the database.
//   - Nothing throws except an IngestError, which carries a status.
//   - Every string is clamped to its limit, so a long field is cut rather than refused.
//   - Every array is capped before it is walked.
//   - Nothing is trusted to be the type it claims; `frames` may be a number, a string or nulls.
import { createHash } from 'node:crypto'
import { ISSUE_LEVELS } from '../../shared/contracts'
import type { DisplayFrame, IssueLevel, SourceLine } from '../../shared/contracts'

/** Refused before parsing. Well past any real event; the SDK's own cap is 60 kB. */
export const MAX_EVENT_BYTES = 200 * 1024

const MAX = { title: 500, culprit: 500, environment: 60, release: 60 }
const MAX_FRAMES = 50
const MAX_CODE_LINES = 20

/** The payload versions this understands. Released SDKs live in apps nobody here controls, so
 *  this only grows; an unknown version is refused rather than guessed at. */
export const SUPPORTED_VERSIONS = [1]

/** A refusal, with the status the sender gets. Never a 500: an SDK that gets one cannot know it
 *  should stop retrying. */
export class IngestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** An event, checked and clamped to what an issue stores. */
export interface IngestEvent {
  title: string
  message: string
  exception: { type: string; value: string; frames: DisplayFrame[] } | null
  frames: DisplayFrame[]
  culprit: string
  level: IssueLevel
  environment: string
  release: string
  /** Milliseconds; never in the future. */
  timestamp: number
}

export function clamp(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  return value.length > max ? value.slice(0, max) : value
}

/** The SDK's wire frames (filename, function, lineno, colno) as the pages show them: one `loc`
 *  string, so the pages never assemble a location per platform. */
export function toDisplayFrames(raw: unknown): DisplayFrame[] {
  if (!Array.isArray(raw)) return []
  const frames: DisplayFrame[] = []
  for (let i = 0; i < raw.length && frames.length < MAX_FRAMES; i++) {
    const frame = raw[i]
    if (!frame || typeof frame !== 'object') continue
    const filename = clamp(frame.filename, 500)
    const lineno = typeof frame.lineno === 'number' ? frame.lineno : null
    const colno = typeof frame.colno === 'number' ? frame.colno : null
    let loc = filename
    if (loc && lineno !== null) loc += `:${lineno}${colno !== null ? `:${colno}` : ''}`
    const display: DisplayFrame = {
      func: clamp(frame.function, 200) || '?',
      loc: loc || 'unknown',
    }
    // Source context, captured at throw time by the SDK: from disk in Node, or from the app's
    // own symbolicate endpoint in a browser.
    if (Array.isArray(frame.code)) {
      const code: SourceLine[] = []
      for (let j = 0; j < frame.code.length && code.length < MAX_CODE_LINES; j++) {
        const line = frame.code[j]
        if (!line || typeof line !== 'object') continue
        if (typeof line.n !== 'number' || typeof line.text !== 'string') continue
        code.push({ n: line.n, text: clamp(line.text, 400), err: line.err === true })
      }
      if (code.length) display.code = code
    }
    frames.push(display)
  }
  return frames
}

/** "Where it happened", in one line, from the innermost frame. */
export function culpritOf(frames: DisplayFrame[]) {
  const top = frames[0]
  return top ? clamp(`${top.func} (${top.loc})`, MAX.culprit) : ''
}

/** A filename without what changes while the code does not: a query string, a line and column,
 *  a bundler's hex hash. Left in, every deploy would reopen every issue as new. */
export function normaliseFilename(loc: string | undefined) {
  return (
    String(loc)
      .split('?')[0]!
      .split('#')[0]!
      // `:line:col` first: the hash pattern is anchored to the end.
      .replace(/:\d+(:\d+)?$/, '')
      // `main-a1b2c3d4.js` and `main.a1b2c3d4e5f6.js` → `main.js`. Hex only: the pattern that
      // would catch Vite's base64-ish hashes also catches `main-controller.js`, merging two files
      // into one issue. A split issue is visible; a merged one silently loses a bug.
      .replace(/[-.][0-9a-f]{8,}(\.[a-z0-9]+)$/i, '$1')
  )
}

/** Digit runs collapsed, so "rebuilt in 412ms" and "rebuilt in 518ms" are one issue. */
export function normaliseMessage(text: unknown) {
  return String(text || '')
    .replace(/\d+/g, 'N')
    .slice(0, 200)
}

/** What makes two events the same bug: the exception type and the top three frames by function
 *  and file, never line or column, which change without the bug changing. Message-only events
 *  group on their message. Changing this splits or merges every issue's history, so it is
 *  versioned (`v1:`). */
export function fingerprintOf(event: Pick<IngestEvent, 'exception' | 'message'>) {
  const parts: string[] = []
  if (event.exception) {
    parts.push(event.exception.type)
    const frames = event.exception.frames
    for (const frame of frames.slice(0, 3))
      parts.push(`${frame.func}@${normaliseFilename(frame.loc)}`)
    // A stack that parsed to nothing would group every exception of its type together.
    if (!frames.length) parts.push(normaliseMessage(event.exception.value))
  } else parts.push('message', normaliseMessage(event.message))
  return `v1:${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40)}`
}

/** Checks and clamps a raw body, or throws an IngestError. */
export function parseEvent(rawBody: string, now = Date.now()): IngestEvent {
  if (!rawBody) throw new IngestError(400, 'empty body')
  if (rawBody.length > MAX_EVENT_BYTES) throw new IngestError(413, 'event too large')
  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    throw new IngestError(400, 'body is not JSON')
  }
  if (!event || typeof event !== 'object' || Array.isArray(event))
    throw new IngestError(400, 'body is not an event object')
  if (!SUPPORTED_VERSIONS.includes(event.v))
    throw new IngestError(400, 'unsupported payload version')

  const exception = parseException(event.exception)
  const message = clamp(event.message, MAX.title)
  // One with neither would put a blank row on the list.
  if (!exception && !message)
    throw new IngestError(400, 'event has neither an exception nor a message')

  return {
    title: exception ? clamp(`${exception.type}: ${exception.value}`, MAX.title) : message,
    message,
    exception,
    frames: exception ? exception.frames : [],
    culprit: exception ? culpritOf(exception.frames) : '',
    level: ISSUE_LEVELS.includes(event.level) ? event.level : 'error',
    environment: clamp(event.environment, MAX.environment),
    release: clamp(event.release, MAX.release),
    timestamp: parseTimestamp(event.timestamp, now),
  }
}

function parseException(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null
  const { type, value, frames } = raw as Record<string, unknown>
  return {
    type: clamp(typeof type === 'string' && type ? type : 'Error', 120),
    value: clamp(value, MAX.title),
    frames: toDisplayFrames(frames),
  }
}

/** How old an event may say it is: older than an offline queue would hold, it is a wrong clock. */
const MAX_EVENT_AGE = 30 * 24 * 60 * 60 * 1000

/** The reporting machine's clock, which may be wrong or hostile: anything unparseable, in the
 *  future or older than MAX_EVENT_AGE is now, or an issue dated 2049 would top the list forever
 *  and one dated 1970 would say it has been happening for decades. */
function parseTimestamp(raw: unknown, now: number) {
  if (typeof raw !== 'string') return now
  const at = Date.parse(raw)
  // A minute of tolerance for ordinary clock skew.
  return Number.isNaN(at) || at > now + 60_000 || at < now - MAX_EVENT_AGE ? now : at
}
