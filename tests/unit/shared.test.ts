import { describe, expect, it } from 'vitest'
// From source, not the built package, so this needs no build first.
import { ingestUrl, parseDsn } from '../../packages/sdk/src/dsn'
import { parseSearchQuery, setSearchToken } from '../../shared/issues'
import { buildDsn, buildIngestUrl, snippetFor, testEventCommand } from '../../shared/setup'

describe('search', () => {
  it('splits tags from free text, lower-casing both', () => {
    const query = parseSearchQuery('ENV:Production cannot read')
    expect(query.tags.map((tag) => [tag.key, tag.value])).toEqual([['env', 'production']])
    expect(query.terms).toEqual(['cannot', 'read'])
  })

  it('treats an unknown key as free text', () => {
    expect(parseSearchQuery('time:12')).toMatchObject({ tags: [], terms: ['time:12'] })
  })

  it('ignores a half-typed token, without weakening the others', () => {
    expect(parseSearchQuery('env:')).toEqual({ tags: [], terms: [] })
    expect(parseSearchQuery('status:resolved env:').tags.map((tag) => tag.key)).toEqual(['status'])
  })

  it('resolves aliases to one field', () => {
    expect(parseSearchQuery('version:v2 environment:prod').tags.map((tag) => tag.field)).toEqual([
      'release',
      'environment',
    ])
  })

  it('status:all lifts the status filter', () => {
    expect(parseSearchQuery(setSearchToken('status:unresolved', 'status', 'all'))).toEqual({
      tags: [],
      terms: [],
    })
    expect(parseSearchQuery('status:ALL env:prod').tags.map((tag) => tag.key)).toEqual(['env'])
  })
})

describe('setSearchToken', () => {
  it.each([
    ['typeerror', 'env', 'production', 'typeerror env:production'],
    ['', 'level', 'error', 'level:error'],
    ['status:unresolved', 'status', 'unresolved', 'status:unresolved'],
    ['env:debug level:error cannot', 'env', 'production', 'env:production level:error cannot'],
    ['env:debug env:staging level:error', 'env', 'production', 'env:production level:error'],
    ['', 'release', 'v2 beta', 'release:v2'],
    ['typeerror', 'env', '  ', 'typeerror'],
  ])('sets %s + %s:%s to %s', (current, key, value, expected) => {
    expect(setSearchToken(current, key, value)).toBe(expected)
  })
})

describe('the DSN', () => {
  it.each([
    ['https://errors.example', 'https://8f2ac1e9b7d4@errors.example/a1b2c3'],
    ['http://localhost:3000', 'http://8f2ac1e9b7d4@localhost:3000/a1b2c3'],
    ['https://example.com/nexitas/', 'https://8f2ac1e9b7d4@example.com/nexitas/a1b2c3'],
  ])('is built from the app at %s', (origin, dsn) => {
    expect(buildDsn(origin, '8f2ac1e9b7d4', 'a1b2c3')).toBe(dsn)
  })

  // Whatever this builds, the SDK reads, and posts where the pages say it will.
  it.each(['https://errors.example', 'http://localhost:3000', 'https://example.com/nexitas'])(
    'round-trips through the SDK at %s',
    (origin) => {
      const dsn = parseDsn(buildDsn(origin, 'a&b', 'a1b2c3'))
      expect(dsn).toMatchObject({ publicKey: 'a&b', stackId: 'a1b2c3' })
      expect(ingestUrl(dsn)).toBe(buildIngestUrl(origin, 'a&b', 'a1b2c3'))
    },
  )
})

describe('snippetFor', () => {
  const dsn = 'https://k@errors.example/s1'

  it.each(['node', 'Node 24', 'bun', 'express'])('gives %s the server snippet', (platform) => {
    const snippet = snippetFor(platform, dsn, 'https://errors.example')
    expect(snippet).toContain(`dsn: '${dsn}'`)
    expect(snippet).toContain('beforeSend: withSourceContext()')
  })

  it.each(['', 'nuxt', 'browser', 'something new'])(
    'gives %s the script this app serves',
    (platform) => {
      const snippet = snippetFor(platform, dsn, 'https://errors.example/')
      expect(snippet).toContain("from 'https://errors.example/v1/errors.js'")
      expect(snippet).toContain(`dsn: '${dsn}'`)
      expect(snippet).toContain("// symbolicate: '/__erratas/symbolicate'")
    },
  )
})

describe('testEventCommand', () => {
  const url = buildIngestUrl('https://errors.example', 'k', 's1')
  const command = testEventCommand(url)

  it('posts text/plain to the quoted ingest URL, as the SDK does', () => {
    expect(command).toContain(`'${url}'`)
    expect(command).toContain("-H 'content-type: text/plain'")
  })

  it('sends a body ingest accepts', () => {
    expect(JSON.parse(command.match(/-d '(.+)'/)![1]!)).toMatchObject({ v: 1 })
  })
})
