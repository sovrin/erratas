/**
 * The wire format.
 *
 * Every released SDK version lives forever inside applications nobody here
 * controls, so this shape is a permanent contract: ingest has to keep accepting
 * `v: 1` payloads long after it has stopped producing them. That is what `v` is
 * for — bump it when the shape changes incompatibly, and let ingest branch on
 * it, rather than trying to sniff which fields happen to be present.
 */
export const PAYLOAD_VERSION = 1

/**
 * One frame of a stack trace.
 *
 * Everything is optional because a stack is a string produced by an engine we
 * do not control, minified by a bundler we do not control — half-parsed frames
 * are normal and are still worth sending.
 */
export interface StackFrame {
  filename?: string
  function?: string
  lineno?: number
  colno?: number
}

export interface ExceptionPayload {
  /** Constructor name — `TypeError`, `ChunkLoadError`, … */
  type: string
  /** The message. */
  value: string
  /**
   * Innermost frame first: `frames[0]` is where the throw happened.
   *
   * The order matters beyond presentation — grouping fingerprints events from
   * the top frames, so reversing this silently regroups every issue.
   */
  frames: StackFrame[]
}

export type Level = 'error' | 'warning' | 'info'

export interface ErratasEvent {
  v: typeof PAYLOAD_VERSION
  /** 32 hex characters, generated client-side so a retry cannot double-report. */
  event_id: string
  /** ISO 8601, from the reporting machine's clock — which may be wrong. */
  timestamp: string
  level: Level
  platform: 'javascript'
  sdk: { name: string; version: string }
  exception?: ExceptionPayload
  /** Set for `captureMessage`, and as a fallback when a thrown value was not an Error. */
  message?: string
  environment?: string
  release?: string
  tags?: Record<string, string>
  /** Free-form; whatever the host app wants to attach. Never interpreted here. */
  context?: Record<string, unknown>
  request?: { url?: string; referrer?: string }
  user_agent?: string
}

export interface InitOptions {
  /**
   * `https://<publicKey>@<host>/<stackId>`.
   *
   * A malformed one disables reporting with a console warning — never an
   * exception. This runs at the top of someone else's app.
   */
  dsn: string
  /** `production`, `staging`, … Free-form; used to filter in the dashboard. */
  environment?: string
  /** Version/commit of the reporting app, so an issue can be tied to a deploy. */
  release?: string
  /** Attached to every event. */
  tags?: Record<string, string>
  /**
   * Install `error` / `unhandledrejection` listeners. Defaults to true in a
   * browser. Turn it off to report only what you pass to `captureException`.
   */
  autoCapture?: boolean
  /**
   * Last chance to change or drop an event before it is queued — the hook to
   * scrub anything the host app must not send off its own servers. Returning
   * `null` drops the event. Throwing from here drops it too, rather than
   * propagating into the caller's stack.
   */
  beforeSend?: (event: ErratasEvent) => ErratasEvent | null
  /** Emit SDK diagnostics on the console. Off by default; noisy in production. */
  debug?: boolean
}

export interface CaptureOptions {
  level?: Level
  tags?: Record<string, string>
  context?: Record<string, unknown>
}
