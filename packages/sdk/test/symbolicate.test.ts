import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createClient } from '../src/client'
import { symbolicateEvent, type FrameCache } from '../src/symbolicate'
import { PAYLOAD_VERSION, type ErratasEvent, type StackFrame } from '../src/types'

/**
 * The browser half: asking the host app's own server to make a frame readable.
 *
 * The cases that matter are the failure ones. This sits in the reporting path of
 * an application that is already broken, so every way the endpoint can misbehave
 * — dead, slow, lying about its response shape — has to end with the event still
 * being sent, just plainer.
 */

const DSN = 'https://key@erratas.sh/1'
const ENDPOINT = '/__erratas/symbolicate'

const RESOLVED = {
  filename: 'src/UserRepository.ts',
  lineno: 87,
  colno: 9,
  function: 'create',
  code: [
    { n: 86, text: '  {' },
    { n: 87, text: '    return User.query().create(data)', err: true },
    { n: 88, text: '  }' },
  ],
}

function anEvent(frames: StackFrame[]): ErratasEvent {
  return {
    v: PAYLOAD_VERSION,
    event_id: 'a'.repeat(32),
    timestamp: '2026-08-16T00:00:00.000Z',
    level: 'error',
    platform: 'javascript',
    sdk: { name: 'erratas', version: '0' },
    exception: { type: 'TypeError', value: 'boom', frames },
  }
}

const minified = (): StackFrame[] => [
  {
    filename: 'https://app.example.com/assets/app-a1b2c3d4.js',
    lineno: 1,
    colno: 48213,
    function: 't',
  },
]

/** Stands in for the host app's endpoint. */
function endpoint(answer: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    json: async () => answer,
  })) as unknown as typeof fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('symbolicateEvent', () => {
  it('rewrites the frame and attaches the code it got back', async () => {
    vi.stubGlobal('fetch', endpoint({ frames: [RESOLVED] }))
    const event = anEvent(minified())

    await symbolicateEvent(event, ENDPOINT, new Map())

    const frame = event.exception!.frames[0]!
    expect(frame.filename).toBe('src/UserRepository.ts')
    expect(frame.lineno).toBe(87)
    expect(frame.function).toBe('create')
    expect(frame.code).toHaveLength(3)
  })

  it('asks about at most the top three frames', async () => {
    const fetchSpy = endpoint({ frames: [null, null, null] })
    vi.stubGlobal('fetch', fetchSpy)

    await symbolicateEvent(
      anEvent(Array.from({ length: 8 }, () => minified()[0]!)),
      ENDPOINT,
      new Map(),
    )

    const body = JSON.parse(
      (fetchSpy as never as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1]!
        .body as string,
    )
    expect(body.frames).toHaveLength(3)
  })

  it('asks once for a position it has already seen', async () => {
    // A crash loop outlives the 5s dedupe window, so without this the same
    // frame is re-requested for the rest of the session.
    const fetchSpy = endpoint({ frames: [RESOLVED] })
    vi.stubGlobal('fetch', fetchSpy)
    const cache: FrameCache = new Map()

    await symbolicateEvent(anEvent(minified()), ENDPOINT, cache)
    const second = anEvent(minified())
    await symbolicateEvent(second, ENDPOINT, cache)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(second.exception!.frames[0]!.filename).toBe('src/UserRepository.ts')
  })

  it('remembers a miss too, so an unresolvable frame is not re-asked', async () => {
    const fetchSpy = endpoint({ frames: [null] })
    vi.stubGlobal('fetch', fetchSpy)
    const cache: FrameCache = new Map()

    await symbolicateEvent(anEvent(minified()), ENDPOINT, cache)
    await symbolicateEvent(anEvent(minified()), ENDPOINT, cache)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a rejected request', () => vi.fn(async () => Promise.reject(new Error('offline')))],
    ['a non-ok response', () => endpoint({ frames: [RESOLVED] }, false)],
    ['a response that is not the agreed shape', () => endpoint({ frames: [{ nope: true }] })],
    ['a response that is not an object', () => endpoint('sure')],
  ])('leaves the event untouched on %s', async (_label, make) => {
    vi.stubGlobal('fetch', make() as unknown as typeof fetch)
    const event = anEvent(minified())

    await expect(symbolicateEvent(event, ENDPOINT, new Map())).resolves.toBeUndefined()

    const frame = event.exception!.frames[0]!
    expect(frame.filename).toBe('https://app.example.com/assets/app-a1b2c3d4.js')
    expect(frame.code).toBeUndefined()
  })

  it('does nothing for an event with no frames', async () => {
    const fetchSpy = endpoint({ frames: [] })
    vi.stubGlobal('fetch', fetchSpy)

    await symbolicateEvent(anEvent([]), ENDPOINT, new Map())

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('createClient with a symbolicate endpoint', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  function recorder() {
    const sent: ErratasEvent[] = []
    return {
      sent,
      send: (_url: string, body: string) => {
        sent.push(JSON.parse(body) as ErratasEvent)
      },
    }
  }

  const minifiedError = () => {
    const error = new TypeError('boom')
    error.stack =
      'TypeError: boom\n    at t (https://app.example.com/assets/app-a1b2c3d4.js:1:48213)'
    return error
  }

  it('sends the event enriched once source arrives', async () => {
    vi.stubGlobal('fetch', endpoint({ frames: [RESOLVED] }))
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN, symbolicate: ENDPOINT }, send)

    client.captureException(minifiedError())
    await vi.advanceTimersByTimeAsync(0)
    client.flush()

    expect(sent).toHaveLength(1)
    expect(sent[0]!.exception!.frames[0]!.filename).toBe('src/UserRepository.ts')
    expect(sent[0]!.exception!.frames[0]!.code).toHaveLength(3)
  })

  it('keeps the event out of the queue while it waits', async () => {
    // The queue flushes on its own 250ms cadence. If the event had been queued
    // straight away it would go out plain — and a frame that sometimes resolves
    // and sometimes does not lands as two issues for one bug, because grouping
    // keys on the frame's file and function.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})) as unknown as typeof fetch)
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN, symbolicate: ENDPOINT }, send)

    client.captureException(minifiedError())
    await vi.advanceTimersByTimeAsync(250)

    expect(sent).toHaveLength(0)
  })

  it('gives up after the timeout and sends it plain', async () => {
    // A dead endpoint costs the snippet, never the report.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})) as unknown as typeof fetch)
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN, symbolicate: ENDPOINT }, send)

    client.captureException(minifiedError())
    await vi.advanceTimersByTimeAsync(1_500)

    expect(sent).toHaveLength(1)
    expect(sent[0]!.exception!.frames[0]!.code).toBeUndefined()
  })

  it('a flush releases whatever is still waiting, so unload loses nothing', async () => {
    // The endpoint never answers. The report must still leave.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})) as unknown as typeof fetch)
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN, symbolicate: ENDPOINT }, send)

    client.captureMessage('still going out')
    client.close()

    expect(sent).toHaveLength(1)
    expect(sent[0]!.message).toBe('still going out')
  })

  it('stays fully synchronous when no endpoint is configured', async () => {
    const fetchSpy = endpoint({ frames: [RESOLVED] })
    vi.stubGlobal('fetch', fetchSpy)
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN }, send)

    client.captureMessage('hello')
    client.flush()

    expect(sent).toHaveLength(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('runs beforeSend after symbolication, so a scrubber sees the source lines', async () => {
    vi.stubGlobal('fetch', endpoint({ frames: [RESOLVED] }))
    const seen: (string | undefined)[] = []
    const { sent, send } = recorder()
    const client = createClient(
      {
        dsn: DSN,
        symbolicate: ENDPOINT,
        beforeSend: (event) => {
          seen.push(event.exception?.frames[0]?.code?.[1]?.text)
          return event
        },
      },
      send,
    )

    const error = new TypeError('boom')
    error.stack =
      'TypeError: boom\n    at t (https://app.example.com/assets/app-a1b2c3d4.js:1:48213)'
    client.captureException(error)

    await vi.waitFor(() => expect(seen).toHaveLength(1))
    client.flush()

    expect(seen[0]).toBe('    return User.query().create(data)')
    expect(sent).toHaveLength(1)
  })
})
