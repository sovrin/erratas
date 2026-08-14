import { compareByLastSeenDesc } from '../domain/relativeTime'
import type { Issue, IssueStatus } from '../domain/types'
import { matchesSearchQuery, type SearchQuery } from '../search/searchQuery'
import type { TagContext } from '../search/tagResolvers'

/**
 * Turning "everything in this project" into "the ten rows on screen".
 *
 * The order of operations here is the part worth protecting. Stack, environment
 * and the search box narrow the set *first*; the status counts on the tabs are
 * computed from that narrowed set; and only then does the selected status tab
 * filter further. Get it the other way round and the tabs read
 * "unresolved 40 · resolved 12" while the list shows three rows, because the
 * counts would be describing a different set than the one being displayed.
 */

export type StatusSelection = IssueStatus | 'all'

/** `all` rather than null: these come straight from a tab the user clicked. */
export interface DimensionFilter {
  stackId: string | 'all'
  environment: string | 'all'
}

export type StatusCounts = Record<StatusSelection, number>

export interface IssueSelection {
  /** Everything matching the dimensions and the search, newest first. */
  matched: Issue[]
  /** Counts for the status tabs — computed *before* the status filter applies. */
  counts: StatusCounts
  /** What the list should render, after the status tab. */
  visible: Issue[]
}

export function selectIssues(
  issues: readonly Issue[],
  options: {
    filter: DimensionFilter
    status: StatusSelection
    query: SearchQuery
    ctx: TagContext
  },
): IssueSelection {
  const { filter, status, query, ctx } = options

  const matched = issues
    .filter((issue) => {
      if (filter.stackId !== 'all' && issue.stackId !== filter.stackId) return false
      if (filter.environment !== 'all' && issue.environment !== filter.environment) return false
      return matchesSearchQuery(issue, query, ctx)
    })
    // Copied before sorting: the input is the repository's array, and sorting
    // in place would reorder it under whatever else is holding a reference.
    .slice()
    .sort(compareByLastSeenDesc)

  const counts = countByStatus(matched)
  const visible = status === 'all' ? matched : matched.filter((issue) => issue.status === status)

  return { matched, counts, visible }
}

export function countByStatus(issues: readonly Issue[]): StatusCounts {
  const counts: StatusCounts = { all: issues.length, unresolved: 0, resolved: 0, ignored: 0 }
  for (const issue of issues) counts[issue.status] += 1
  return counts
}

/**
 * Environments offered as tabs.
 *
 * Derived from the data rather than hard-coded: the design listed
 * production/staging/development, but an environment is a free-text string an
 * SDK sends, so a project reporting from `preview` would have no way to filter
 * to it. The three conventional names are pinned to the front when present so
 * the tab order does not shuffle as data arrives.
 */
const CONVENTIONAL_ENVIRONMENTS = ['production', 'staging', 'development']

export function environmentsIn(issues: readonly Issue[]): string[] {
  const present = new Set<string>()
  for (const issue of issues) {
    if (issue.environment) present.add(issue.environment)
  }

  const conventional = CONVENTIONAL_ENVIRONMENTS.filter((env) => present.has(env))
  const rest = [...present].filter((env) => !CONVENTIONAL_ENVIRONMENTS.includes(env)).sort()

  return [...conventional, ...rest]
}

export interface ProjectSummary {
  stacks: number
  unresolved: number
  events: number
  users: number
}

/**
 * The line under the header. Counts the *whole* project, not the current
 * filter — it is the "how bad is it overall" number, and having it move when
 * somebody clicks a tab would make it useless as a baseline.
 */
export function summarise(issues: readonly Issue[], stackCount: number): ProjectSummary {
  let events = 0
  let users = 0
  let unresolved = 0

  for (const issue of issues) {
    events += issue.count
    users += issue.users
    if (issue.status === 'unresolved') unresolved += 1
  }

  return { stacks: stackCount, unresolved, events, users }
}
