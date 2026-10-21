import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { captureException, close, init } from '../src/index'

// `init` deliberately takes no transport — it is the public API an application
// calls, and it wires up the real one. So the network itself is stubbed here.
// Without this the suite POSTs to erratas.sh for real, which is slow, flaky and
// rude.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))),
  )
  vi.stubGlobal('navigator', { ...globalThis.navigator, sendBeacon: vi.fn(() => true) })
})

afterEach(() => {
  close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('init', () => {
  // This is the whole promise of the SDK: it runs at the top of somebody
  // else's application, before anything has loaded, and it must not be able to
  // stop that application from booting.
  it('does not throw on a malformed DSN, and warns instead', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => init({ dsn: 'nonsense' })).not.toThrow()
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).toContain('[erratas]')
  })

  it('leaves capture calls harmless when it failed to start', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    init({ dsn: 'nonsense' })

    expect(captureException(new Error('x'))).toBeUndefined()
  })

  it('leaves capture calls harmless when init was never called', () => {
    expect(captureException(new Error('x'))).toBeUndefined()
  })

  it('returns an event id once running', () => {
    init({ dsn: 'https://key@erratas.sh/1', autoCapture: false })

    expect(captureException(new Error('x'))).toMatch(/^[0-9a-f]{32}$/)
  })

  it('reports an uncaught error through the window handler', () => {
    init({ dsn: 'https://key@erratas.sh/1' })

    const error = new Error('from the page')
    window.dispatchEvent(new ErrorEvent('error', { error, message: 'from the page' }))
    close()

    // close() flushes with the beacon transport, which is the path a real page
    // takes when it is being torn down.
    expect(navigator.sendBeacon).toHaveBeenCalledOnce()
    const [url, blob] = vi.mocked(navigator.sendBeacon).mock.calls[0]!
    expect(String(url)).toContain('/v1/errors/1')
    expect(blob).toBeInstanceOf(Blob)
  })
})
