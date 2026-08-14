import { describe, expect, it } from 'vitest'

// Imported from source rather than from the published `@erratas/sdk` entry so
// this test does not depend on the package having been built first.
import { parseDsn } from '../../packages/sdk/src/dsn'
import { buildDsn } from './dsn'

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
