import { describe, expect, it } from 'vitest'

import { EMPTY_QUERY, parseSearchQuery } from '../search/searchQuery'
import { anIssue, TEST_TAG_CONTEXT } from '../test/fixtures'
import { selectIssues, summarise } from './issueQuery'

const select = (
  issues: ReturnType<typeof anIssue>[],
  options: Partial<Parameters<typeof selectIssues>[1]> = {},
) => selectIssues(issues, { query: EMPTY_QUERY, ctx: TEST_TAG_CONTEXT, ...options })

describe('selectIssues', () => {
  it('orders newest first', () => {
    const issues = [
      anIssue({ id: 'old', lastSeen: '2026-08-01T00:00:00.000Z' }),
      anIssue({ id: 'new', lastSeen: '2026-08-14T00:00:00.000Z' }),
      anIssue({ id: 'mid', lastSeen: '2026-08-07T00:00:00.000Z' }),
    ]

    expect(select(issues).visible.map((i) => i.id)).toEqual(['new', 'mid', 'old'])
  })

  it('does not reorder the array it was given', () => {
    const issues = [
      anIssue({ id: 'old', lastSeen: '2026-08-01T00:00:00.000Z' }),
      anIssue({ id: 'new', lastSeen: '2026-08-14T00:00:00.000Z' }),
    ]

    select(issues)

    expect(issues.map((i) => i.id)).toEqual(['old', 'new'])
  })

  it('applies the search query', () => {
    const issues = [
      anIssue({ id: 'a', release: 'v2.4.1' }),
      anIssue({ id: 'b', release: 'v2.3.9' }),
    ]

    expect(
      select(issues, { query: parseSearchQuery('release:v2.4') }).visible.map((i) => i.id),
    ).toEqual(['a'])
  })

  /*
   * The dimensions that used to have their own controls are tokens now, and this is
   * the test that says so: one box does what a stack menu, an environment menu and a
   * status tab row did between them.
   */
  it('narrows by stack, environment and status as search tokens', () => {
    const issues = [
      anIssue({ id: 'a', stackId: 'frontend', environment: 'production', status: 'unresolved' }),
      anIssue({ id: 'b', stackId: 'backend', environment: 'production', status: 'unresolved' }),
      anIssue({ id: 'c', stackId: 'frontend', environment: 'staging', status: 'unresolved' }),
      anIssue({ id: 'd', stackId: 'frontend', environment: 'production', status: 'resolved' }),
    ]

    const ids = (raw: string) =>
      select(issues, { query: parseSearchQuery(raw) }).visible.map((i) => i.id)

    expect(ids('stack:frontend')).toEqual(['a', 'c', 'd'])
    expect(ids('env:staging')).toEqual(['c'])
    expect(ids('status:resolved')).toEqual(['d'])
    expect(ids('stack:frontend env:production status:unresolved')).toEqual(['a'])
  })
})

describe('summarise', () => {
  const NOW = Date.parse('2026-08-18T12:00:00.000Z')
  const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString()

  it('totals the whole project regardless of the search', () => {
    const issues = [
      anIssue({ status: 'unresolved', count: 10, users: 3 }),
      anIssue({ status: 'resolved', count: 5, users: 2 }),
    ]

    expect(summarise(issues, 2, NOW)).toMatchObject({
      stacks: 2,
      unresolved: 1,
      events: 15,
      users: 5,
    })
  })

  it('counts issues first seen inside the last 24 hours', () => {
    const issues = [
      anIssue({ id: 'a', firstSeen: hoursAgo(1) }),
      anIssue({ id: 'b', firstSeen: hoursAgo(23) }),
      anIssue({ id: 'c', firstSeen: hoursAgo(25) }),
    ]

    expect(summarise(issues, 1, NOW).newIn24h).toBe(2)
  })

  it('reports the most recent event in the project', () => {
    const issues = [
      anIssue({ id: 'old', lastSeen: hoursAgo(40) }),
      anIssue({ id: 'new', lastSeen: hoursAgo(2) }),
      anIssue({ id: 'mid', lastSeen: hoursAgo(9) }),
    ]

    expect(summarise(issues, 1, NOW).lastEventAt).toBe(hoursAgo(2))
  })

  it('reports no last event for an empty project, rather than a fake date', () => {
    expect(summarise([], 0, NOW).lastEventAt).toBeNull()
  })

  it('ignores an unparseable lastSeen instead of letting it win', () => {
    const issues = [
      anIssue({ id: 'bad', lastSeen: 'not a date' }),
      anIssue({ id: 'ok', lastSeen: hoursAgo(3) }),
    ]

    expect(summarise(issues, 1, NOW).lastEventAt).toBe(hoursAgo(3))
  })
})
