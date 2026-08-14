import type { Client } from './client'

/**
 * The two things a browser tells you about for free, plus the moment to flush.
 *
 * `addEventListener` rather than assigning `window.onerror`: assignment
 * clobbers whatever the host app — or another error reporter, or a framework's
 * dev overlay — had already installed there, and "the SDK silently disabled the
 * app's own error handling" is not a bug anyone enjoys finding.
 */
export function installBrowserHandlers(client: Client): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {}
  }

  const onError = (event: ErrorEvent) => {
    // `event.error` is the thrown value and is what we want. It is absent for
    // cross-origin script errors — the browser blanks those to "Script error."
    // unless the script was served with CORS headers and loaded with
    // `crossorigin` — so fall back to the flat message/filename/line fields,
    // which are all that survives in that case.
    if (event.error !== undefined && event.error !== null) {
      client.captureException(event.error)
      return
    }

    // Reconstructed as an Error, rather than assembled into a payload here, so
    // the fallback goes down exactly the same path as everything else and keeps
    // the client's environment, release and tags. A hand-built event silently
    // loses all three.
    const message = event.message || 'Unknown error'
    const error = new Error(message)
    error.stack = event.filename
      ? `Error: ${message}\n    at ${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}`
      : ''
    client.captureException(error)
  }

  const onRejection = (event: PromiseRejectionEvent) => {
    client.captureException(event.reason)
  }

  // A closing page cancels in-flight requests. `pagehide` is the event that
  // actually fires on iOS Safari, where `beforeunload` and `unload` are not
  // reliable, and it also covers the back/forward cache. `visibilitychange` to
  // hidden catches a tab being backgrounded before it is discarded.
  const onPageHide = () => client.flush(true)
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') client.flush(true)
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

/**
 * Node is deliberately not instrumented.
 *
 * Attaching a listener to `uncaughtException` changes the process's semantics —
 * Node stops exiting on an uncaught throw once anything is listening, so an SDK
 * that installs one silently converts crashes into zombie processes. A library
 * has no business making that decision for its host. In Node, call
 * `captureException` yourself from the error handler you already have.
 */
