import { describe, expect, it } from 'vitest'
// From source, not the built package, so this needs no build first.
import { ingestUrl, parseDsn } from '../../packages/sdk/src/dsn'
import type { Issue } from '../../shared/contracts'
import {
  formatAge,
  formatAgeAgo,
  matchesSearchQuery,
  paginate,
  parseSearchQuery,
  selectIssues,
  setSearchToken,
  summarise,
} from '../../shared/issues'
import { buildDsn, buildIngestUrl, snippetFor, testEventCommand } from '../../shared/setup'

const NOW = Date.parse('2026-08-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

const anIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: 'i1',
  projectId: 'sonotas',
  stackId: 's1',
  stackName: 'frontend',
  title: "TypeError: Cannot read properties of undefined (reading 'map')",
  culprit: 'renderUserList (src/components/UserList.vue:42)',
  level: 'error',
  status: 'unresolved',
  count: 1284,
  firstSeen: NOW - 200 * HOUR,
  lastSeen: NOW - HOUR,
  environment: 'production',
  release: 'v2.4.1',
  ...overrides,
})

const match = (raw: string, issue = anIssue()) => matchesSearchQuery(issue, parseSearchQuery(raw))

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
    expect(match('env:')).toBe(true)
    expect(match('status:resolved env:')).toBe(false)
  })

  it('matches free text against the title and culprit', () => {
    expect(match('typeerror')).toBe(true)
    expect(match('userlist.vue')).toBe(true)
    expect(match('nothing-like-this')).toBe(false)
  })

  it.each([
    ['release:v2.4', true],
    ['release:v9', false],
    ['version:v2.4.1', true],
    ['env:prod', true],
    ['environment:production', true],
    ['level:err', true],
    ['level:warning', false],
    ['stack:front', true],
    ['project:sonotas', true],
    ['project:other', false],
  ])('resolves %s to %s', (raw, expected) => {
    expect(match(raw)).toBe(expected)
  })

  // `'unresolved'.includes('resolved')`: the reason status matches by prefix.
  it('does not answer status:resolved with unresolved issues', () => {
    expect(match('status:resolved')).toBe(false)
    expect(match('status:resolved', anIssue({ status: 'resolved' }))).toBe(true)
    expect(match('status:un')).toBe(true)
  })

  it('ANDs every token, and a missing value never matches', () => {
    expect(match('env:production level:error typeerror')).toBe(true)
    expect(match('env:production level:info')).toBe(false)
    expect(match('release:v', anIssue({ release: '' }))).toBe(false)
  })

  it('lists matches newest first, leaving its input alone', () => {
    const issues = [
      anIssue({ id: 'old', lastSeen: NOW - 40 * HOUR }),
      anIssue({ id: 'new', lastSeen: NOW - HOUR }),
      anIssue({ id: 'other', lastSeen: NOW, environment: 'staging' }),
    ]
    expect(selectIssues(issues, parseSearchQuery('env:prod')).map((issue) => issue.id)).toEqual([
      'new',
      'old',
    ])
    expect(issues.map((issue) => issue.id)).toEqual(['old', 'new', 'other'])
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

describe('summarise', () => {
  it('counts what is outstanding, new and arriving', () => {
    const issues = [
      anIssue({ count: 10, firstSeen: NOW - HOUR, lastSeen: NOW - 2 * HOUR }),
      anIssue({ count: 5, status: 'resolved', firstSeen: NOW - 25 * HOUR, lastSeen: NOW - HOUR }),
    ]
    expect(summarise(issues, NOW)).toEqual({
      unresolved: 1,
      newIn24h: 1,
      events: 15,
      lastEventAt: NOW - HOUR,
    })
  })

  it('has no last event for an empty list, rather than a fake date', () => {
    expect(summarise([], NOW).lastEventAt).toBeNull()
  })
})

describe('paginate', () => {
  const items = Array.from({ length: 47 }, (_, index) => index + 1)

  it('slices and labels a page', () => {
    expect(paginate(items, 5, 10)).toMatchObject({
      items: [41, 42, 43, 44, 45, 46, 47],
      page: 5,
      pages: 5,
      label: '41–47 of 47',
    })
  })

  it.each([
    [99, 5],
    [0, 1],
    [Number.NaN, 1],
  ])('clamps page %s to %s', (requested, page) => {
    expect(paginate(items, requested, 10).page).toBe(page)
  })

  it('never says page 0 of 0', () => {
    expect(paginate([], 1)).toMatchObject({ page: 1, pages: 1, label: '0 of 0' })
  })
})

describe('formatAge', () => {
  it.each([
    [0, 'now'],
    [59_000, 'now'],
    [59 * 60_000, '59m'],
    [119 * 60_000, '1h'],
    [23 * HOUR, '23h'],
    [9 * 24 * HOUR, '9d'],
    [-60_000, 'now'],
  ])('renders %ims as %s', (age, expected) => {
    expect(formatAge(NOW - age, NOW)).toBe(expected)
  })

  it('says "ago" only for a real age', () => {
    expect(formatAgeAgo(NOW - 9 * 24 * HOUR, NOW)).toBe('9d ago')
    expect(formatAgeAgo(NOW, NOW)).toBe('now')
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
