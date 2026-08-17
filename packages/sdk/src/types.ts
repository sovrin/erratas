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
 * One line of source, as it looked when the error happened.
 *
 * `n` is the line's real number in its file, not its index in the window — the
 * dashboard prints it in the gutter, and a window starting at line 82 that
 * claimed to start at 1 would send a reader to the wrong place.
 */
export interface SourceLine {
  n: number
  text: string
  /** The line the frame points at. Exactly one line in a window carries this. */
  err?: boolean
}

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
  /**
   * A few lines of source around `lineno`, captured at throw time.
   *
   * Optional and additive, so this is **not** a `v` bump: ingest has accepted
   * `frame.code` since before anything produced it, and a `v: 1` payload
   * without it stays exactly as valid as it was.
   *
   * Captured rather than resolved later, and that is the whole point. Source
   * moves — the build that threw this is not the build deployed next week, and
   * a snippet reconstructed afterwards from a current source map is a confident
   * lie about the past. A snapshot taken at the moment of the throw cannot
   * drift, for the same reason `lastSeen` only moves forward.
   *
   * Only something holding the right source can fill this in. In Node that is
   * the process itself (see `@erratas/sdk/node`); in a browser it is the app's
   * own server, because a map a browser can fetch is a map anyone can fetch.
   */
  code?: SourceLine[]
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
  /**
   * URL of a symbolicate endpoint on **your own** server, which turns minified
   * browser frames back into readable source — see `createSymbolicateHandler`
   * in `@erratas/sdk/node`.
   *
   * Set this and reports wait briefly (up to a second) for source before being
   * sent; a slow or dead endpoint costs the snippet, never the report. Leave it
   * unset and nothing changes: reporting stays entirely synchronous.
   *
   * Two consequences worth knowing. Resolved frames name your original files, so
   * they group separately from the minified frames the same bug produced before
   * — issues split once, at the deploy that enables this. And the endpoint hands
   * out slices of your source to anyone who can call it, so put it behind
   * whatever gate that deserves in your application.
   */
  symbolicate?: string
  /** Emit SDK diagnostics on the console. Off by default; noisy in production. */
  debug?: boolean
}

export interface CaptureOptions {
  level?: Level
  tags?: Record<string, string>
  context?: Record<string, unknown>
}
