import { describe, expect, it } from 'vitest'

import { DsnError, ingestUrl, parseDsn } from '../src/dsn'

describe('parseDsn', () => {
  it('parses the documented form', () => {
    expect(parseDsn('https://8f2ac1e9b7d4@erratas.sh/1')).toEqual({
      protocol: 'https',
      publicKey: '8f2ac1e9b7d4',
      host: 'erratas.sh',
      port: '',
      pathPrefix: '',
      stackId: '1',
    })
  })

  it('keeps an explicit port', () => {
    const dsn = parseDsn('http://key@localhost:8090/7')
    expect(dsn.port).toBe('8090')
    expect(dsn.protocol).toBe('http')
  })

  // Self-hosting behind a reverse proxy at a subpath is the normal case, not an
  // exotic one — the stack id is the last segment, never the only one.
  it('separates a path prefix from the stack id', () => {
    const dsn = parseDsn('https://key@example.com/erratas/inner/42')
    expect(dsn.pathPrefix).toBe('/erratas/inner')
    expect(dsn.stackId).toBe('42')
  })

  // Sentry's original format carried a secret half that no browser SDK could
  // keep. A DSN copied from an old tutorial should still work.
  it('ignores a legacy secret half', () => {
    expect(parseDsn('https://public:secret@erratas.sh/1').publicKey).toBe('public')
  })

  it.each([
    ['', 'empty'],
    ['not-a-url', 'not a URL'],
    ['ftp://key@erratas.sh/1', 'wrong protocol'],
    ['https://erratas.sh/1', 'no key'],
    ['https://key@erratas.sh', 'no stack id'],
    ['https://key@erratas.sh/', 'trailing slash only'],
  ])('rejects %s (%s)', (raw) => {
    expect(() => parseDsn(raw)).toThrow(DsnError)
  })
})

describe('ingestUrl', () => {
  it('puts the stack in the path and the key in the query', () => {
    expect(ingestUrl(parseDsn('https://8f2ac1e9b7d4@erratas.sh/1'))).toBe(
      'https://erratas.sh/v1/errors/1?erratas_key=8f2ac1e9b7d4',
    )
  })

  it('preserves port and path prefix', () => {
    expect(ingestUrl(parseDsn('http://k@localhost:8090/erratas/3'))).toBe(
      'http://localhost:8090/erratas/v1/errors/3?erratas_key=k',
    )
  })
})
