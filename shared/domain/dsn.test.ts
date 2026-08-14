import { describe, expect, it } from 'vitest'

// Imported from source rather than from the published `@erratas/sdk` entry so
// this test does not depend on the package having been built first.
import { ingestUrl, parseDsn } from '../../packages/sdk/src/dsn'
import { buildDsn, buildIngestUrl } from './dsn'

describe('buildDsn', () => {
  it('produces the documented shape', () => {
    expect(buildDsn({ host: 'erratas.sh', publicKey: '8f2ac1e9b7d4', stackId: '1' })).toBe(
      'https://8f2ac1e9b7d4@erratas.sh/1',
    )
  })

  it('defaults to https even on a localhost host', () => {
    // A dev dashboard handing out an http DSN to a production app is a silent
    // downgrade nobody would notice until it was mixed-content blocked.
    expect(buildDsn({ host: 'localhost:3000', publicKey: 'k', stackId: 's' })).toMatch(/^https:/)
  })

  it('honours an explicit protocol', () => {
    expect(
      buildDsn({ host: 'localhost:3000', publicKey: 'k', stackId: 's', protocol: 'http' }),
    ).toBe('http://k@localhost:3000/s')
  })

  it('tolerates a host with a trailing slash', () => {
    expect(buildDsn({ host: 'erratas.sh/', publicKey: 'k', stackId: '1' })).toBe(
      'https://k@erratas.sh/1',
    )
  })

  // The contract that actually matters: whatever this builds, the SDK reads.
  // Asserting the string alone would let the two drift the moment the format
  // grows a segment.
  it.each([
    ['erratas.sh', 'abc123def456', 'pbc3f9x2k1m4n5o'],
    ['localhost:3000', 'k', '1'],
    ['errors.example.com', '8f2ac1e9b7d4', 'a1b2c3'],
  ])('round-trips through the SDK parser (%s)', (host, publicKey, stackId) => {
    const parsed = parseDsn(buildDsn({ host, publicKey, stackId }))

    expect(parsed.publicKey).toBe(publicKey)
    expect(parsed.stackId).toBe(stackId)
    expect(parsed.host).toBe(host.split(':')[0])
  })
})

describe('buildIngestUrl', () => {
  // The one that matters: the URL shown in the dashboard has to be the URL the
  // SDK will actually POST to. Derived from the SDK rather than asserted as a
  // literal, so the two cannot drift apart while both still look right.
  it.each([
    ['erratas.sh', 'abc123def456', 'pbc3f9x2k1m4n5o', undefined],
    ['localhost:3000', 'k', '1', 'http' as const],
    ['example.com/erratas', '8f2ac1e9b7d4', '42', undefined],
  ])('matches what the SDK derives (%s)', (host, publicKey, stackId, protocol) => {
    const parts = { host, publicKey, stackId, protocol }

    expect(buildIngestUrl(parts)).toBe(ingestUrl(parseDsn(buildDsn(parts))))
  })

  it('keeps a path prefix in front of the api segment', () => {
    // Self-hosting behind a reverse proxy at /erratas is normal, and the prefix
    // belongs before /api rather than anywhere else in the path.
    expect(buildIngestUrl({ host: 'example.com/erratas', publicKey: 'k', stackId: '42' })).toBe(
      'https://example.com/erratas/api/42/store/?erratas_key=k',
    )
  })

  it('escapes a key that would otherwise break the query string', () => {
    expect(buildIngestUrl({ host: 'erratas.sh', publicKey: 'a&b', stackId: '1' })).toContain(
      'erratas_key=a%26b',
    )
  })
})
