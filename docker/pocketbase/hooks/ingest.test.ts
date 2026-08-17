import { createHash } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

/**
 * `ingest.js` runs inside PocketBase's goja VM, not Node — but its interesting
 * parts are pure, and the grouping rule in particular is the most consequential
 * decision in the product: changing it splits or merges every issue's history.
 * That deserves tests, so the module is written to depend on exactly one host
 * global and it is stubbed here.
 */
declare global {
  // eslint-disable-next-line no-var
  var $security: { sha256: (text: string) => string } | undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ingest: any

beforeAll(async () => {
  globalThis.$security = {
    sha256: (text: string) => createHash('sha256').update(text).digest('hex'),
  }
  ingest = await import('./ingest.js')
})

const anEvent = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  level: 'error',
  exception: {
    type: 'TypeError',
    value: "Cannot read properties of undefined (reading 'map')",
    frames: [
      {
        filename: 'https://app.example/main.js',
        function: 'renderUserList',
        lineno: 42,
        colno: 18,
      },
    ],
  },
  ...overrides,
})

const fingerprint = (raw: object) => ingest.fingerprintOf(ingest.parseEvent(JSON.stringify(raw)))

describe('parseEvent', () => {
  it('normalises a well-formed event', () => {
    const event = ingest.parseEvent(JSON.stringify(anEvent({ environment: 'production' })))

    expect(event.title).toBe("TypeError: Cannot read properties of undefined (reading 'map')")
    expect(event.culprit).toBe('renderUserList (https://app.example/main.js:42:18)')
    expect(event.level).toBe('error')
    expect(event.environment).toBe('production')
    expect(event.frames[0]).toEqual({
      func: 'renderUserList',
      loc: 'https://app.example/main.js:42:18',
    })
  })

  it.each([
    ['', 'empty body', 400],
    ['not json', 'body is not JSON', 400],
    ['[]', 'body is not an event object', 400],
    ['null', 'body is not an event object', 400],
    ['{"v":99}', 'unsupported payload version', 400],
    ['{"v":1}', 'event has neither an exception nor a message', 400],
  ])('rejects %s', (body, message, status) => {
    expect(() => ingest.parseEvent(body)).toThrow(message)
    try {
      ingest.parseEvent(body)
    } catch (err) {
      expect((err as { ingestStatus: number }).ingestStatus).toBe(status)
    }
  })

  it('rejects an oversized body before parsing it', () => {
    const huge = 'x'.repeat(ingest.MAX_EVENT_BYTES + 1)
    expect(() => ingest.parseEvent(huge)).toThrow('event too large')
  })

  // Every one of these is a shape a hostile or simply broken client can send,
  // and none of them may reach a column as-is.
  it.each([
    ['frames as a number', { frames: 42 }],
    ['frames as a string', { frames: 'boom' }],
    ['frames of nulls', { frames: [null, undefined, 3] }],
    ['a frame with no fields', { frames: [{}] }],
  ])('survives %s', (_label, exception) => {
    const event = ingest.parseEvent(
      JSON.stringify(anEvent({ exception: { type: 'Error', value: 'x', ...exception } })),
    )
    expect(Array.isArray(event.frames)).toBe(true)
  })

  it('clamps every string to its column width', () => {
    const event = ingest.parseEvent(
      JSON.stringify(
        anEvent({
          environment: 'e'.repeat(500),
          release: 'r'.repeat(500),
          user: 'u'.repeat(900),
          exception: { type: 'Error', value: 'v'.repeat(5000), frames: [] },
        }),
      ),
    )

    expect(event.environment.length).toBe(60)
    expect(event.release.length).toBe(60)
    expect(event.user.length).toBe(200)
    expect(event.title.length).toBe(500)
  })

  it('caps the number of frames', () => {
    const frames = Array.from({ length: 500 }, (_, i) => ({
      filename: 'a.js',
      function: `f${i}`,
      lineno: i,
    }))
    const event = ingest.parseEvent(
      JSON.stringify(anEvent({ exception: { type: 'Error', value: 'x', frames } })),
    )

    expect(event.frames).toHaveLength(50)
  })

  it('accepts a message-only event', () => {
    const event = ingest.parseEvent(
      JSON.stringify({ v: 1, level: 'info', message: 'cache rebuilt' }),
    )

    expect(event.title).toBe('cache rebuilt')
    expect(event.exception).toBeNull()
    expect(event.level).toBe('info')
  })

  it('falls back to error for an unknown level', () => {
    expect(ingest.parseEvent(JSON.stringify(anEvent({ level: 'catastrophe' }))).level).toBe('error')
  })

  // A machine reporting from 2049 would otherwise sit at the top of the list
  // forever.
  it('refuses a timestamp from the future', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const event = ingest.parseEvent(JSON.stringify(anEvent({ timestamp: future })))

    expect(event.timestamp.getTime()).toBeLessThan(Date.now() + 60_000)
  })

  it.each(['not-a-date', 42, null])('falls back to now for timestamp %s', (timestamp) => {
    const event = ingest.parseEvent(JSON.stringify(anEvent({ timestamp })))
    expect(event.timestamp.getTime()).toBeGreaterThan(Date.now() - 5000)
  })
})

describe('fingerprintOf', () => {
  it('groups two occurrences of the same bug', () => {
    expect(fingerprint(anEvent())).toBe(fingerprint(anEvent()))
  })

  // The whole point: the parts of a build that change without the code changing
  // must not create a new issue, or every deploy resets every history.
  it('ignores line and column numbers', () => {
    const moved = anEvent({
      exception: {
        type: 'TypeError',
        value: "Cannot read properties of undefined (reading 'map')",
        frames: [
          {
            filename: 'https://app.example/main.js',
            function: 'renderUserList',
            lineno: 84,
            colno: 3,
          },
        ],
      },
    })

    expect(fingerprint(moved)).toBe(fingerprint(anEvent()))
  })

  it('ignores a bundle content hash in the filename', () => {
    const rebuilt = anEvent({
      exception: {
        type: 'TypeError',
        value: "Cannot read properties of undefined (reading 'map')",
        frames: [
          {
            filename: 'https://app.example/main-9f3a1c7e.js',
            function: 'renderUserList',
            lineno: 42,
          },
        ],
      },
    })
    const original = anEvent({
      exception: {
        type: 'TypeError',
        value: "Cannot read properties of undefined (reading 'map')",
        frames: [
          {
            filename: 'https://app.example/main-a1b2c3d4.js',
            function: 'renderUserList',
            lineno: 42,
          },
        ],
      },
    })

    expect(fingerprint(rebuilt)).toBe(fingerprint(original))
  })

  it('ignores a cache-busting query string', () => {
    const busted = anEvent({
      exception: {
        type: 'TypeError',
        value: 'x',
        frames: [{ filename: 'https://app.example/main.js?v=99', function: 'f', lineno: 1 }],
      },
    })
    const plain = anEvent({
      exception: {
        type: 'TypeError',
        value: 'x',
        frames: [{ filename: 'https://app.example/main.js', function: 'f', lineno: 1 }],
      },
    })

    expect(fingerprint(busted)).toBe(fingerprint(plain))
  })

  // ...and the things that genuinely are different bugs must stay apart.
  it('separates the same error thrown from different functions', () => {
    const elsewhere = anEvent({
      exception: {
        type: 'TypeError',
        value: "Cannot read properties of undefined (reading 'map')",
        frames: [
          { filename: 'https://app.example/main.js', function: 'renderInvoice', lineno: 42 },
        ],
      },
    })

    expect(fingerprint(elsewhere)).not.toBe(fingerprint(anEvent()))
  })

  it('separates different exception types', () => {
    const other = anEvent({
      exception: { type: 'RangeError', value: 'x', frames: anEvent().exception.frames },
    })

    expect(fingerprint(other)).not.toBe(fingerprint(anEvent()))
  })

  it('separates different files', () => {
    const other = anEvent({
      exception: {
        type: 'TypeError',
        value: "Cannot read properties of undefined (reading 'map')",
        frames: [
          { filename: 'https://app.example/other.js', function: 'renderUserList', lineno: 42 },
        ],
      },
    })

    expect(fingerprint(other)).not.toBe(fingerprint(anEvent()))
  })

  // With no frames to group on, the message is all there is — otherwise every
  // exception of the same type in the whole stack would collapse into one row.
  it('falls back to the message when a stack did not parse', () => {
    const a = anEvent({ exception: { type: 'Error', value: 'database is down', frames: [] } })
    const b = anEvent({ exception: { type: 'Error', value: 'disk is full', frames: [] } })

    expect(fingerprint(a)).not.toBe(fingerprint(b))
  })

  it('groups messages that differ only by numbers', () => {
    const a = { v: 1, message: 'cache rebuilt in 412ms' }
    const b = { v: 1, message: 'cache rebuilt in 518ms' }

    expect(fingerprint(a)).toBe(fingerprint(b))
  })

  it('separates genuinely different messages', () => {
    expect(fingerprint({ v: 1, message: 'cache rebuilt' })).not.toBe(
      fingerprint({ v: 1, message: 'cache corrupted' }),
    )
  })

  it('never exceeds the fingerprint column', () => {
    expect(fingerprint(anEvent()).length).toBeLessThanOrEqual(128)
  })

  // Versioned so a future rule can be introduced without pretending the old
  // groupings were computed the new way.
  it('is versioned', () => {
    expect(fingerprint(anEvent())).toMatch(/^v1:/)
  })
})

describe('withUser', () => {
  it('adds a user once', () => {
    const first = ingest.withUser([], 'lea@quant.fm')
    expect(first.grew).toBe(true)
    expect(first.set).toHaveLength(1)

    const again = ingest.withUser(first.set, 'lea@quant.fm')
    expect(again.grew).toBe(false)
    expect(again.set).toHaveLength(1)
  })

  it('counts distinct users', () => {
    let set: string[] = []
    for (const user of ['a@x.io', 'b@x.io', 'c@x.io', 'a@x.io']) {
      set = ingest.withUser(set, user).set
    }
    expect(set).toHaveLength(3)
  })

  it('ignores an event with no user', () => {
    expect(ingest.withUser([], '').grew).toBe(false)
  })

  it('stores a hash rather than the identifier', () => {
    const { set } = ingest.withUser([], 'lea@quant.fm')
    expect(set[0]).not.toContain('lea')
    expect(set[0]).toMatch(/^[0-9a-f]{8}$/)
  })

  // Written on every single event, so it cannot grow without bound.
  it('stops growing at the cap', () => {
    const full = Array.from({ length: ingest.MAX_SEEN_USERS }, (_, i) => String(i).padStart(8, '0'))
    const result = ingest.withUser(full, 'someone-new@x.io')

    expect(result.grew).toBe(false)
    expect(result.set).toHaveLength(ingest.MAX_SEEN_USERS)
  })

  it('tolerates a missing or corrupt column', () => {
    expect(ingest.withUser(null, 'a@x.io').set).toHaveLength(1)
    expect(ingest.withUser('nonsense', 'a@x.io').set).toHaveLength(1)
  })
})

/**
 * The shape a JSON column actually comes back as.
 *
 * `record.get()` does not return what was stored — it returns raw bytes, which
 * `Array.isArray` reports as an array. Passing that straight into `withUser`
 * grew the set by one entry per byte and made `users` the length of the
 * serialised JSON. The original tests all passed decoded arrays and never saw
 * it; these are here so that cannot happen twice.
 */
describe('asHashSet', () => {
  const toBytes = (text: string) => [...text].map((c) => c.charCodeAt(0))

  it('decodes the raw bytes of a stored array', () => {
    expect(ingest.asHashSet(toBytes('["625bdc79","42c2ccba"]'))).toEqual(['625bdc79', '42c2ccba'])
  })

  it('decodes a JSON string', () => {
    expect(ingest.asHashSet('["625bdc79"]')).toEqual(['625bdc79'])
  })

  it('passes an already-decoded array through', () => {
    expect(ingest.asHashSet(['625bdc79'])).toEqual(['625bdc79'])
  })

  it.each([null, undefined, '', 0, {}, 'not json', [null, null]])('returns [] for %s', (input) => {
    expect(ingest.asHashSet(input)).toEqual([])
  })

  it('survives a set large enough to need chunked decoding', () => {
    const hashes = Array.from({ length: ingest.MAX_SEEN_USERS }, (_, i) =>
      String(i).padStart(8, '0'),
    )
    expect(ingest.asHashSet(toBytes(JSON.stringify(hashes)))).toHaveLength(ingest.MAX_SEEN_USERS)
  })

  // The end-to-end shape of the bug: a stored set arriving as bytes must add
  // one user, not several hundred.
  it('adds exactly one user to a byte-encoded set', () => {
    const stored = toBytes('["625bdc79"]')
    const result = ingest.withUser(stored, 'someone-else@x.io')

    expect(result.grew).toBe(true)
    expect(result.set).toHaveLength(2)
  })
})

/**
 * Content hashes are the reason this exists. A bundle's filename changes on every
 * deploy while the code in it does not, and the fingerprint is built from that
 * filename — so anything left un-stripped here re-opens every issue in a project
 * at each release.
 */
describe('normaliseFilename', () => {
  it.each([
    // Vite, Next and rollup: dash-separated.
    ['/assets/main-a1b2c3d4.js', '/assets/main.js'],
    // webpack and tsc: dot-separated. This was the gap.
    ['/assets/main.a1b2c3d4e5f6.js', '/assets/main.js'],
    ['/static/chunks/main-app-0123456789ab.js', '/static/chunks/main-app.js'],
    // Query strings and fragments are per-request noise.
    ['/app.js?v=42', '/app.js'],
    ['/app.js#frag', '/app.js'],
    // A trailing position is stripped before the hash pattern is tried, or the
    // pattern would never match.
    ['/assets/main-a1b2c3d4.js:1:48213', '/assets/main.js'],
    ['/assets/main.a1b2c3d4e5f6.js:1:2', '/assets/main.js'],
  ])('strips %s', (input, expected) => {
    expect(ingest.normaliseFilename(input)).toBe(expected)
  })

  it.each([
    // Words, not hashes. Stripping these would merge unrelated files into one
    // issue, which loses information silently — worse than leaving them split.
    ['/src/main-controller.js'],
    ['/src/user.service.js'],
    // Too short to be a content hash.
    ['/src/main-abc123.js'],
    // Original source, which is what a symbolicated frame names.
    ['src/UserRepository.ts'],
  ])('leaves %s alone', (input) => {
    expect(ingest.normaliseFilename(input)).toBe(input)
  })

  it('gives two hashes of the same bundle one fingerprint', () => {
    // The whole point: yesterday's deploy and today's must group together.
    const frames = (file: string) => [{ func: 'create', loc: file }]
    const before = ingest.fingerprintOf({
      exception: { type: 'TypeError', value: 'x', frames: frames('/assets/app.1111aaaa.js:1:5') },
    })
    const after = ingest.fingerprintOf({
      exception: { type: 'TypeError', value: 'x', frames: frames('/assets/app.2222bbbb.js:9:9') },
    })

    expect(before).toBe(after)
  })
})
