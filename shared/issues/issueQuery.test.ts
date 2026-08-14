import { describe, expect, it } from 'vitest'

import { EMPTY_QUERY, parseSearchQuery } from '../search/searchQuery'
import { anIssue, TEST_TAG_CONTEXT } from '../test/fixtures'
import { countByStatus, environmentsIn, selectIssues, summarise } from './issueQuery'

const ALL_STACKS = { stackId: 'all' as const, environment: 'all' as const }

const select = (
  issues: ReturnType<typeof anIssue>[],
  options: Partial<Parameters<typeof selectIssues>[1]> = {},
) =>
  selectIssues(issues, {
    filter: ALL_STACKS,
    status: 'all',
    query: EMPTY_QUERY,
    ctx: TEST_TAG_CONTEXT,
    ...options,
  })

describe('selectIssues', () => {
  it('narrows by stack and environment', () => {
    const issues = [
      anIssue({ id: 'a', stackId: 'frontend', environment: 'production' }),
      anIssue({ id: 'b', stackId: 'backend', environment: 'production' }),
      anIssue({ id: 'c', stackId: 'frontend', environment: 'staging' }),
    ]

    expect(
      select(issues, { filter: { stackId: 'frontend', environment: 'all' } }).visible,
    ).toHaveLength(2)
    expect(
      select(issues, { filter: { stackId: 'all', environment: 'staging' } }).visible,
    ).toHaveLength(1)
    expect(
      select(issues, { filter: { stackId: 'backend', environment: 'staging' } }).visible,
    ).toHaveLength(0)
  })

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

  // The tabs and the list must describe the same set. Counting after the status
  // filter would show "unresolved 40" above a list of three rows.
  it('counts statuses before the status tab applies', () => {
    const issues = [
      anIssue({ id: 'a', status: 'unresolved' }),
      anIssue({ id: 'b', status: 'unresolved' }),
      anIssue({ id: 'c', status: 'resolved' }),
      anIssue({ id: 'd', status: 'ignored' }),
    ]

    const selection = select(issues, { status: 'unresolved' })

    expect(selection.counts).toEqual({ all: 4, unresolved: 2, resolved: 1, ignored: 1 })
    expect(selection.visible.map((i) => i.id)).toEqual(['a', 'b'])
  })

  // ...but the counts *do* respond to the other dimensions, because those did
  // narrow the set being described.
  it('counts within the current stack and search', () => {
    const issues = [
      anIssue({ id: 'a', stackId: 'frontend', status: 'unresolved' }),
      anIssue({ id: 'b', stackId: 'backend', status: 'unresolved' }),
      anIssue({ id: 'c', stackId: 'backend', status: 'resolved' }),
    ]

    const selection = select(issues, {
      filter: { stackId: 'backend', environment: 'all' },
      status: 'all',
    })

    expect(selection.counts).toEqual({ all: 2, unresolved: 1, resolved: 1, ignored: 0 })
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
})

describe('countByStatus', () => {
  it('reports zeroes for an empty list', () => {
    expect(countByStatus([])).toEqual({ all: 0, unresolved: 0, resolved: 0, ignored: 0 })
  })
})

describe('environmentsIn', () => {
  // Derived from the data: an environment is a free-text string an SDK sends,
  // so a project reporting from `preview` must still be filterable.
  it('pins the conventional names first, then sorts the rest', () => {
    const issues = [
      anIssue({ environment: 'preview' }),
      anIssue({ environment: 'staging' }),
      anIssue({ environment: 'production' }),
      anIssue({ environment: 'canary' }),
    ]

    expect(environmentsIn(issues)).toEqual(['production', 'staging', 'canary', 'preview'])
  })

  it('omits conventional names that nothing reports from', () => {
    expect(environmentsIn([anIssue({ environment: 'production' })])).toEqual(['production'])
  })

  it('ignores issues with no environment', () => {
    expect(environmentsIn([anIssue({ environment: '' })])).toEqual([])
  })
})

describe('summarise', () => {
  it('totals the whole project regardless of any filter', () => {
    const issues = [
      anIssue({ status: 'unresolved', count: 10, users: 3 }),
      anIssue({ status: 'resolved', count: 5, users: 2 }),
    ]

    expect(summarise(issues, 2)).toEqual({ stacks: 2, unresolved: 1, events: 15, users: 5 })
  })
})
