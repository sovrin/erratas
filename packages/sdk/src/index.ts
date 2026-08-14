import { closeClient, createClient, getClient, setClient } from './client'
import { installBrowserHandlers } from './handlers'
import type { CaptureOptions, InitOptions } from './types'

export type {
  CaptureOptions,
  ErratasEvent,
  ExceptionPayload,
  InitOptions,
  Level,
  StackFrame,
} from './types'
export { PAYLOAD_VERSION } from './types'
export { parseDsn, ingestUrl, DsnError, type Dsn } from './dsn'

/**
 * Starts reporting.
 *
 * ```ts
 * import { init } from '@erratas/sdk'
 *
 * init({ dsn: 'https://8f2ac1e9b7d4@erratas.sh/1' })
 * ```
 *
 * This is the first thing an application calls, before anything interesting has
 * loaded — so it cannot fail loudly. A malformed DSN, a browser missing an API
 * we wanted, anything at all: reporting turns itself off and the host app boots
 * exactly as it would have. An error logger that can crash the application it
 * is watching is worse than no error logger.
 */
export function init(options: InitOptions): void {
  try {
    const client = createClient(options)
    const autoCapture = options.autoCapture ?? true
    const uninstall = autoCapture ? installBrowserHandlers(client) : () => {}
    setClient(client, uninstall)
  } catch (err) {
    // Warn rather than stay mute: a silently dead SDK is indistinguishable from
    // an app that never throws, and people have lost days to that.
    console.warn(`[erratas] disabled: ${err instanceof Error ? err.message : String(err)}`)
    closeClient()
  }
}

/**
 * Reports something that was caught.
 *
 * Returns the event id, or `undefined` when reporting is not running — never
 * throws, whatever is passed to it.
 */
export function captureException(thrown: unknown, options?: CaptureOptions): string | undefined {
  try {
    return getClient()?.captureException(thrown, options)
  } catch {
    return undefined
  }
}

/** Reports a message with no exception attached. Defaults to level `info`. */
export function captureMessage(message: string, options?: CaptureOptions): string | undefined {
  try {
    return getClient()?.captureMessage(message, options)
  } catch {
    return undefined
  }
}

/**
 * Sends anything still queued.
 *
 * Reporting is buffered, so a short-lived process — a serverless invocation, a
 * CLI — can exit before the queue drains. Call this before it does.
 */
export function flush(): void {
  try {
    getClient()?.flush()
  } catch {
    // nothing a caller could do about it
  }
}

/** Stops reporting and removes the global handlers. Flushes what is queued. */
export function close(): void {
  try {
    getClient()?.close()
  } catch {
    // fall through — the client is going away either way
  }
  closeClient()
}
