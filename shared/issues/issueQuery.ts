import { ageMs, compareByLastSeenDesc } from '../domain/relativeTime'
import type { Issue } from '../domain/types'
import { matchesSearchQuery, type SearchQuery } from '../search/searchQuery'
import type { TagContext } from '../search/tagResolvers'

/**
 * Turning "everything in this project" into "the ten rows on screen".
 *
 * This used to take three filters: a stack, an environment, and a status, each with
 * its own control on the page. It takes one now, because the search box understands
 * all three as tokens (`stack:api env:production status:resolved`) and understands
 * six more besides. The ordering rule this file used to protect — narrow first, count
 * from the narrowed set, apply status last, so the tab counts could never describe a
 * different set than the list — did not disappear with the tabs: it moved to
 * `suggestSearch`, which counts each offered value against the set the *other* tokens
 * narrowed. Same guarantee, now for every dimension rather than one.
 */

export interface IssueSelection {
  /** Everything matching the search, newest first. */
  visible: Issue[]
}

export function selectIssues(
  issues: readonly Issue[],
  options: { query: SearchQuery; ctx: TagContext },
): IssueSelection {
  const { query, ctx } = options

  const visible = issues
    .filter((issue) => matchesSearchQuery(issue, query, ctx))
    // Copied before sorting: the input is the repository's array, and sorting
    // in place would reorder it under whatever else is holding a reference.
    .slice()
    .sort(compareByLastSeenDesc)

  return { visible }
}

export interface ProjectSummary {
  stacks: number
  unresolved: number
  events: number
  /**
   * Distinct affected users.
   *
   * Reported here and deliberately *not* rendered in the headline: the SDK never sends a
   * user, so ingest has nothing to hash and this is structurally 0 for every project.
   * A permanent zero beside three real numbers does not read as "unknown", it reads as
   * "nobody was affected" — which is a claim this app cannot currently make. It stays in
   * the summary so the day ingest fills it in, the headline is one line away.
   */
  users: number
  /** Issues whose *first* event landed inside the last 24 hours. */
  newIn24h: number
  /** The most recent event anywhere in the project, or null if there is none. */
  lastEventAt: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The line under the header. Counts the *whole* project, not the current search — it is
 * the "how bad is it overall" number, and having it move as somebody types would make it
 * useless as a baseline.
 *
 * `now` is a parameter for the same reason it is one throughout `relativeTime`: this stays
 * pure, and the component passes its ticking clock.
 *
 * The two derived numbers are the ones a totals row cannot give you. A count of unresolved
 * issues says how much is outstanding but not whether anything is *happening*: a project
 * with forty open issues and nothing reported in a week is in a different state from one
 * with three that are all arriving now, and the old line read identically for both.
 * `newIn24h` and `lastEventAt` are what separate them, and both are derivable from what
 * an issue already stores — no new column, no event table.
 */
export function summarise(
  issues: readonly Issue[],
  stackCount: number,
  now: number,
): ProjectSummary {
  let events = 0
  let users = 0
  let unresolved = 0
  let newIn24h = 0
  let lastEventAt: string | null = null
  let latest = Number.NEGATIVE_INFINITY

  for (const issue of issues) {
    events += issue.count
    users += issue.users
    if (issue.status === 'unresolved') unresolved += 1

    const firstAge = ageMs(issue.firstSeen, now)
    if (firstAge !== null && firstAge < DAY_MS) newIn24h += 1

    // Tracked by parsed value rather than by string compare: `lastSeen` is written by
    // ingest and nothing guarantees a single format forever.
    const at = issue.lastSeen ? Date.parse(issue.lastSeen) : Number.NaN
    if (!Number.isNaN(at) && at > latest) {
      latest = at
      lastEventAt = issue.lastSeen
    }
  }

  return { stacks: stackCount, unresolved, events, users, newIn24h, lastEventAt }
}
