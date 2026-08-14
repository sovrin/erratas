import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createClient } from '../src/client'
import type { ErratasEvent } from '../src/types'

const DSN = 'https://key@erratas.sh/1'

/** Collects what the transport was handed, so tests can read the wire payload. */
function recorder() {
  const sent: { url: string; event: ErratasEvent; useBeacon: boolean }[] = []
  const send = (url: string, body: string, useBeacon: boolean) => {
    sent.push({ url, event: JSON.parse(body) as ErratasEvent, useBeacon })
  }
  return { sent, send }
}

beforeEach(() => {
  vi.useFakeTimers()
})

describe('createClient', () => {
  it('sends a captured exception with a parsed stack', () => {
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN, environment: 'test', release: 'v1' }, send)

    const error = new TypeError('boom')
    error.stack = 'TypeError: boom\n    at doThing (main.js:1:2)'
    client.captureException(error)
    client.flush()

    expect(sent).toHaveLength(1)
    const event = sent[0]!.event
    expect(event.v).toBe(1)
    expect(event.exception?.type).toBe('TypeError')
    expect(event.exception?.value).toBe('boom')
    expect(event.exception?.frames[0]?.function).toBe('doThing')
    expect(event.environment).toBe('test')
    expect(event.release).toBe('v1')
    expect(event.event_id).toMatch(/^[0-9a-f]{32}$/)
    expect(sent[0]!.url).toContain('erratas_key=key')
  })

  // Applications throw strings and plain objects. Those are exactly the
  // codebases that break, so an SDK that only understands Error misses them.
  it.each([
    ['a string', 'nope', 'nope'],
    ['undefined', undefined, 'undefined'],
    ['a plain object', { code: 500 }, '{"code":500}'],
  ])('captures %s', (_label, thrown, expected) => {
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN }, send)

    client.captureException(thrown)
    client.flush()

    expect(sent[0]!.event.exception).toEqual({
      type: 'UnknownError',
      value: expected,
      frames: [],
    })
  })

  it('merges init tags with per-capture tags', () => {
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN, tags: { app: 'web', env: 'a' } }, send)

    client.captureException(new Error('x'), { tags: { env: 'b' } })
    client.flush()

    expect(sent[0]!.event.tags).toEqual({ app: 'web', env: 'b' })
  })

  it('buffers rather than sending immediately, then flushes on its timer', () => {
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN }, send)

    client.captureException(new Error('x'))
    expect(sent).toHaveLength(0)

    vi.advanceTimersByTime(250)
    expect(sent).toHaveLength(1)
  })

  // A throw inside a render loop fires hundreds of times a second and is one
  // bug; sending every occurrence costs bandwidth and disk and tells nobody
  // anything new.
  it('drops repeats of the same error inside the dedupe window', () => {
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN }, send)

    const throwIt = () => {
      const error = new Error('same')
      error.stack = 'Error: same\n    at loop (main.js:1:2)'
      client.captureException(error)
    }
    throwIt()
    throwIt()
    throwIt()
    client.flush()

    expect(sent).toHaveLength(1)
  })

  it('treats the same message from a different place as a different bug', () => {
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN }, send)

    const first = new Error('same')
    first.stack = 'Error: same\n    at a (main.js:1:2)'
    const second = new Error('same')
    second.stack = 'Error: same\n    at b (other.js:9:9)'

    client.captureException(first)
    client.captureException(second)
    client.flush()

    expect(sent).toHaveLength(2)
  })

  // Without this, one bug in the host app turns the SDK into a denial of
  // service against the ingest server.
  it('stops at the per-minute rate limit', () => {
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN }, send)

    // Distinct messages so de-duplication is not what is being measured.
    for (let i = 0; i < 100; i++) {
      client.captureException(new Error(`distinct ${i}`))
      client.flush()
    }

    expect(sent).toHaveLength(30)
  })

  describe('beforeSend', () => {
    it('can rewrite an event', () => {
      const { sent, send } = recorder()
      const client = createClient(
        {
          dsn: DSN,
          beforeSend: (event) => ({ ...event, exception: undefined, message: 'redacted' }),
        },
        send,
      )

      client.captureException(new Error('secret token abc'))
      client.flush()

      expect(sent[0]!.event.message).toBe('redacted')
      expect(sent[0]!.event.exception).toBeUndefined()
    })

    it('drops the event when it returns null', () => {
      const { sent, send } = recorder()
      const client = createClient({ dsn: DSN, beforeSend: () => null }, send)

      client.captureException(new Error('x'))
      client.flush()

      expect(sent).toHaveLength(0)
    })

    // beforeSend is host-app code running inside our reporting path. If it
    // throws, that must not escape into whatever frame we were called from.
    it('swallows a throw and drops the event', () => {
      const { sent, send } = recorder()
      const client = createClient(
        {
          dsn: DSN,
          beforeSend: () => {
            throw new Error('bad hook')
          },
        },
        send,
      )

      expect(() => client.captureException(new Error('x'))).not.toThrow()
      client.flush()
      expect(sent).toHaveLength(0)
    })
  })

  // The queue must never be the reason an error escapes into the host app.
  it('survives a transport that throws', () => {
    const client = createClient({ dsn: DSN }, () => {
      throw new Error('network is down')
    })

    client.captureException(new Error('x'))
    expect(() => client.flush()).not.toThrow()
  })

  it('uses the beacon transport when closing', () => {
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN }, send)

    client.captureException(new Error('x'))
    client.close()

    expect(sent[0]!.useBeacon).toBe(true)
  })

  it('captures a message at info level by default', () => {
    const { sent, send } = recorder()
    const client = createClient({ dsn: DSN }, send)

    client.captureMessage('just so you know')
    client.flush()

    expect(sent[0]!.event.level).toBe('info')
    expect(sent[0]!.event.message).toBe('just so you know')
  })
})
