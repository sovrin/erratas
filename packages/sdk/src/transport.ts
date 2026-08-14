import type { ErratasEvent } from './types'

/**
 * Getting events off the machine without ever becoming the reason the machine
 * is slow, or the reason an error disappears.
 *
 * One request per event, not a batch. Batching would cut requests during a
 * crash loop, but it also means ingest has to unpack an envelope and decide what
 * to do when three events in one body are valid and the fourth is not. The crash
 * loop is handled where it actually belongs — by the rate limit and the
 * de-duplication in the client — and batching stays available later behind a
 * payload version bump.
 */

/**
 * `fetch(keepalive: true)` is capped at 64 KiB of body across all in-flight
 * keepalive requests, per the Fetch spec, and browsers reject the request
 * outright when it is exceeded. A stack trace with a long minified filename can
 * approach that, so anything large is sent as an ordinary request instead — it
 * may be cancelled on unload, which is strictly better than never being sent.
 */
const KEEPALIVE_LIMIT_BYTES = 60 * 1024

export type Sender = (url: string, body: string, useBeacon: boolean) => Promise<void> | void

/**
 * The default transport.
 *
 * `content-type: text/plain` is not sloppiness — it is one of the three values
 * CORS treats as "simple". `application/json` would make every cross-origin
 * report fire an OPTIONS preflight first, doubling the requests and failing
 * during page unload. Ingest therefore has to parse a JSON body that arrives
 * labelled as text.
 */
export const defaultSender: Sender = (url, body, useBeacon) => {
  const beacon = typeof navigator !== 'undefined' ? navigator.sendBeacon : undefined

  // sendBeacon hands the payload to the browser, which sends it after the page
  // is gone. It is the only transport that survives a tab closing, and it
  // cannot set headers — hence the key in the query string, and the Blob type
  // standing in for a content-type.
  if (useBeacon && beacon) {
    try {
      const queued = beacon.call(navigator, url, new Blob([body], { type: 'text/plain' }))
      if (queued) return
      // A false return means the browser's beacon queue is full; fall through
      // and try a normal request rather than silently dropping the event.
    } catch {
      // Some environments expose sendBeacon and throw on use. Fall through.
    }
  }

  if (typeof fetch === 'undefined') return

  return fetch(url, {
    method: 'POST',
    body,
    // The DSN key is the only credential; sending cookies to a third-party
    // ingest host would be a privacy leak and would break the CORS wildcard.
    credentials: 'omit',
    mode: 'cors',
    keepalive: body.length <= KEEPALIVE_LIMIT_BYTES,
    headers: { 'content-type': 'text/plain;charset=UTF-8' },
  }).then(
    () => undefined,
    () => undefined, // a failed report is not the host app's problem
  )
}

export interface QueueOptions {
  url: string
  send: Sender
  /**
   * Hard ceiling on events sent per minute. A tight render loop that throws can
   * produce thousands of events a second; without this the SDK turns one bug in
   * the host app into a denial of service against the ingest server, and into a
   * saturated network for the user.
   */
  maxPerMinute: number
  /** Events held while waiting to flush. Beyond this the oldest are dropped. */
  maxQueued: number
  onDebug?: (message: string) => void
}

export class EventQueue {
  private queue: ErratasEvent[] = []
  private sentTimestamps: number[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private flushing = false

  constructor(private readonly options: QueueOptions) {}

  add(event: ErratasEvent): void {
    if (this.queue.length >= this.options.maxQueued) {
      // Drop the oldest: during a crash loop the newest events are the ones
      // still describing a live problem, and the oldest are duplicates of them.
      this.queue.shift()
      this.options.onDebug?.('queue full, dropped oldest event')
    }
    this.queue.push(event)
    this.schedule()
  }

  /**
   * Sends everything queued.
   *
   * `useBeacon` is set by the unload path: at that point a normal request is
   * likely to be cancelled mid-flight, and sendBeacon is the only thing the
   * browser promises to finish.
   */
  flush(useBeacon = false): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    // Re-entrancy guard: a synchronous sender that throws could otherwise get
    // us back in here with a half-drained queue.
    if (this.flushing) return
    this.flushing = true

    try {
      const pending = this.queue
      this.queue = []

      for (const event of pending) {
        if (!this.underRateLimit()) {
          this.options.onDebug?.('rate limit reached, dropping event')
          continue
        }
        this.sentTimestamps.push(Date.now())
        try {
          void this.options.send(this.options.url, JSON.stringify(event), useBeacon)
        } catch {
          // A transport that throws is a transport failure. Reporting it would
          // send it through this same queue and loop forever.
        }
      }
    } finally {
      this.flushing = false
    }
  }

  private schedule(): void {
    if (this.timer !== null) return
    // A short delay, not an immediate send: an error rarely arrives alone, and
    // coalescing the burst costs the reader a quarter-second of latency on a
    // dashboard nobody is watching in real time.
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, 250)

    // Node keeps the process alive for a pending timer, which would stop a CLI
    // from exiting for a quarter second after it reports. Browsers have no
    // unref and do not need one.
    ;(this.timer as { unref?: () => void }).unref?.()
  }

  private underRateLimit(): boolean {
    const cutoff = Date.now() - 60_000
    this.sentTimestamps = this.sentTimestamps.filter((at) => at > cutoff)
    return this.sentTimestamps.length < this.options.maxPerMinute
  }
}
