import { parseStack } from './stacktrace'
import {
  PAYLOAD_VERSION,
  type CaptureOptions,
  type ErratasEvent,
  type ExceptionPayload,
} from './types'
import { SDK_NAME, SDK_VERSION } from './version'

/**
 * 32 hex characters, generated on the reporting machine so that a retry after a
 * timeout is recognisable as the same event rather than becoming a second one.
 */
export function eventId(): string {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto

  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID().replace(/-/g, '')
  }

  if (globalCrypto?.getRandomValues) {
    const bytes = globalCrypto.getRandomValues(new Uint8Array(16))
    let out = ''
    for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
    return out
  }

  // Math.random is not a good id source, but the alternative here is no id at
  // all: this branch is old browsers and non-secure contexts, where a collision
  // costs one merged event and nothing else.
  let out = ''
  while (out.length < 32) out += Math.random().toString(16).slice(2)
  return out.slice(0, 32)
}

/**
 * Turns whatever was thrown into an exception payload.
 *
 * "Whatever" is meant literally: `throw 'nope'`, `Promise.reject(undefined)` and
 * `throw {code: 500}` are all things real applications do, and an error logger
 * that only understands `Error` misses precisely the sloppiest code — which is
 * the code that breaks.
 */
export function toException(thrown: unknown): ExceptionPayload {
  if (thrown instanceof Error) {
    return {
      type: thrown.name || 'Error',
      value: String(thrown.message ?? ''),
      frames: parseStack(thrown.stack),
    }
  }

  // DOMException and cross-realm Errors fail `instanceof` but still carry the
  // same three properties — an iframe or a worker is enough to produce one.
  if (isErrorLike(thrown)) {
    return {
      type: String(thrown.name || 'Error'),
      value: String(thrown.message ?? ''),
      frames: parseStack(thrown.stack),
    }
  }

  return { type: 'UnknownError', value: describe(thrown), frames: [] }
}

function isErrorLike(value: unknown): value is { name?: string; message?: string; stack?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  )
}

/** A readable one-liner for a thrown non-Error, without risking a throw of our own. */
function describe(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  try {
    const json = JSON.stringify(value)
    if (json && json !== '{}') return json.slice(0, 1000)
  } catch {
    // circular, or a getter that throws — fall through to Object#toString
  }

  return Object.prototype.toString.call(value)
}

export function buildEvent(
  exception: ExceptionPayload | undefined,
  message: string | undefined,
  options: CaptureOptions,
  base: { environment?: string; release?: string; tags?: Record<string, string> },
): ErratasEvent {
  const event: ErratasEvent = {
    v: PAYLOAD_VERSION,
    event_id: eventId(),
    timestamp: new Date().toISOString(),
    level: options.level ?? 'error',
    platform: 'javascript',
    sdk: { name: SDK_NAME, version: SDK_VERSION },
  }

  if (exception) event.exception = exception
  if (message) event.message = message
  if (base.environment) event.environment = base.environment
  if (base.release) event.release = base.release

  const tags = { ...base.tags, ...options.tags }
  if (Object.keys(tags).length) event.tags = tags
  if (options.context) event.context = options.context

  // Browser-only context. Guarded rather than assumed: the same bundle is
  // imported by SSR frameworks and by Node services, where `document` is not a
  // thing and touching it would throw inside the reporting path.
  if (typeof document !== 'undefined') {
    event.request = {
      url: document.location?.href,
      referrer: document.referrer || undefined,
    }
  }
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    event.user_agent = navigator.userAgent
  }

  return event
}

/**
 * Identity used to suppress repeats.
 *
 * The top frame is included because the same `TypeError: x is not a function`
 * thrown from two different places is two different bugs, and dropping one of
 * them as a duplicate would hide it entirely.
 */
export function dedupeKey(event: ErratasEvent): string {
  const frame = event.exception?.frames[0]
  return [
    event.exception?.type ?? '',
    event.exception?.value ?? event.message ?? '',
    frame?.filename ?? '',
    frame?.lineno ?? '',
    frame?.colno ?? '',
  ].join('|')
}
