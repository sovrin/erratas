import { ingestUrl, parseDsn } from './dsn'
import { buildEvent, dedupeKey, toException } from './event'
import { defaultSender, EventQueue, type Sender } from './transport'
import type { CaptureOptions, ErratasEvent, InitOptions } from './types'

/**
 * Repeats of the same error within this window are dropped.
 *
 * A `TypeError` inside a render loop or a resize handler fires hundreds of times
 * a second; every one of those is the same bug, and sending them all buys the
 * reader nothing while costing them their bandwidth and our disk. Five seconds
 * is short enough that a genuinely recurring problem still shows a rising count.
 */
const DEDUPE_WINDOW_MS = 5_000

const MAX_EVENTS_PER_MINUTE = 30
const MAX_QUEUED = 30

export interface Client {
  capture(event: ErratasEvent): void
  captureException(thrown: unknown, options?: CaptureOptions): string | undefined
  captureMessage(message: string, options?: CaptureOptions): string | undefined
  flush(useBeacon?: boolean): void
  close(): void
}

/**
 * The active client, or null when `init` was never called or its DSN was
 * unusable. Every public entry point tolerates null — an app that ships without
 * a DSN configured must still run.
 */
let current: Client | null = null
let teardown: (() => void) | null = null

export function getClient(): Client | null {
  return current
}

export function setClient(client: Client | null, onClose?: () => void): void {
  teardown?.()
  current = client
  teardown = onClose ?? null
}

export function closeClient(): void {
  teardown?.()
  teardown = null
  current = null
}

export function createClient(options: InitOptions, sender: Sender = defaultSender): Client {
  const dsn = parseDsn(options.dsn)
  const url = ingestUrl(dsn)
  const debug = (message: string) => {
    if (options.debug) console.warn(`[erratas] ${message}`)
  }

  const queue = new EventQueue({
    url,
    send: sender,
    maxPerMinute: MAX_EVENTS_PER_MINUTE,
    maxQueued: MAX_QUEUED,
    onDebug: debug,
  })

  const recentlySeen = new Map<string, number>()

  function isDuplicate(event: ErratasEvent): boolean {
    const key = dedupeKey(event)
    const now = Date.now()

    // Sweep on write rather than on a timer: this map only grows when events
    // are being produced, so there is no idle case that needs collecting.
    for (const [seen, at] of recentlySeen) {
      if (now - at > DEDUPE_WINDOW_MS) recentlySeen.delete(seen)
    }

    const last = recentlySeen.get(key)
    recentlySeen.set(key, now)
    return last !== undefined && now - last <= DEDUPE_WINDOW_MS
  }

  function capture(event: ErratasEvent): void {
    if (isDuplicate(event)) {
      debug('duplicate event dropped')
      return
    }

    let finished: ErratasEvent | null = event
    if (options.beforeSend) {
      try {
        finished = options.beforeSend(event)
      } catch (err) {
        // beforeSend is host-app code running inside our reporting path. If it
        // throws we drop the event rather than let the failure escape into
        // whatever unlucky stack frame we were called from.
        debug(`beforeSend threw, dropping event: ${String(err)}`)
        return
      }
    }
    if (!finished) return

    queue.add(finished)
  }

  const base = {
    environment: options.environment,
    release: options.release,
    tags: options.tags,
  }

  return {
    capture,

    captureException(thrown, captureOptions = {}) {
      const event = buildEvent(toException(thrown), undefined, captureOptions, base)
      capture(event)
      return event.event_id
    },

    captureMessage(message, captureOptions = {}) {
      const event = buildEvent(
        undefined,
        String(message),
        { level: 'info', ...captureOptions },
        base,
      )
      capture(event)
      return event.event_id
    },

    flush(useBeacon = false) {
      queue.flush(useBeacon)
    },

    close() {
      queue.flush(true)
    },
  }
}
