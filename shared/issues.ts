// Turning every issue into the rows on screen: the search, the summary line and paging.
// Plain functions over plain data, so all of it is tested without a database or a browser.
import type { Issue } from './contracts'

// ── Search
// One box, two behaviours: `key:value` narrows a dimension, anything else is free text over the
// title and culprit. Forgiving on purpose: a key nobody registered (`time:12`) is text, since a
// search that silently finds nothing is the worst answer to a typo.

type TagResolver = (issue: Issue) => string

/** The searchable dimensions, with aliases: people type `env` and `environment`. */
export const TAG_RESOLVERS: Readonly<Record<string, TagResolver>> = {
  stack: (issue) => issue.stackName,
  env: (issue) => issue.environment,
  environment: (issue) => issue.environment,
  release: (issue) => issue.release,
  version: (issue) => issue.release,
  level: (issue) => issue.level,
  status: (issue) => issue.status,
}

/** The dimensions as the search box names them, aliases left out. */
export const SEARCH_KEYS = ['status', 'level', 'stack', 'env', 'release']

/** Matched by prefix, not substring: `'unresolved'.includes('resolved')`, so substring matching
 *  answered `status:resolved` with every unresolved issue. Prefix still lets `level:err` reach
 *  `error`. */
const PREFIX_MATCHED = new Set(['status', 'level'])

export interface SearchQuery {
  tags: { key: string; value: string; resolve: TagResolver }[]
  terms: string[]
}

const TOKEN = /^([a-z]+):(.*)$/i

export function parseSearchQuery(raw: string): SearchQuery {
  const query: SearchQuery = { tags: [], terms: [] }
  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    const match = TOKEN.exec(token)
    const key = match?.[1]!.toLowerCase()
    const resolve = key ? TAG_RESOLVERS[key] : undefined
    if (key && resolve) {
      // `env:` with no value yet is half-typed, not a filter: read as text it would empty the list.
      if (match![2]) query.tags.push({ key, value: match![2].toLowerCase(), resolve })
    } else query.terms.push(token.toLowerCase())
  }
  return query
}

/** Every token must match, so adding one narrows. Values match as substrings (`release:v2.4`
 *  finds `v2.4.1`), the closed sets by prefix. */
export function matchesSearchQuery(issue: Issue, query: SearchQuery) {
  for (const tag of query.tags) {
    const value = tag.resolve(issue).toLowerCase()
    if (!value) return false
    if (PREFIX_MATCHED.has(tag.key) ? !value.startsWith(tag.value) : !value.includes(tag.value))
      return false
  }
  const text = `${issue.title} ${issue.culprit}`.toLowerCase()
  return query.terms.every((term) => text.includes(term))
}

/** Sets a dimension to a value, for a click on a tag or a figure: replaces any token for the same
 *  key in place, since two values of one dimension can never both match. A value is cut at its
 *  first space, as the box splits on whitespace. */
export function setSearchToken(current: string, key: string, value: string) {
  const word = value.trim().split(/\s+/)[0]
  if (!word) return current.trim()
  const token = `${key}:${word}`
  const sameKey = (candidate: string) => candidate.toLowerCase().startsWith(`${key}:`)
  const tokens = current.trim().split(/\s+/).filter(Boolean)
  const first = tokens.findIndex(sameKey)
  if (first === -1) return [...tokens, token].join(' ')
  return tokens
    .map((candidate, index) => (index === first ? token : candidate))
    .filter((candidate, index) => index === first || !sameKey(candidate))
    .join(' ')
}

/** The issues matching the search, newest first. */
export function selectIssues(issues: readonly Issue[], query: SearchQuery) {
  return issues
    .filter((issue) => matchesSearchQuery(issue, query))
    .sort((a, b) => b.lastSeen - a.lastSeen)
}

// ── The summary line

const DAY = 24 * 60 * 60 * 1000

/** The whole list's baseline, whatever the search. It answers "is anything happening": what is
 *  outstanding, what is new, and how long since anything arrived. Forty open issues and a quiet
 *  week read differently from three arriving now. */
export function summarise(issues: readonly Issue[], now: number) {
  let unresolved = 0
  let newIn24h = 0
  let events = 0
  let lastEventAt: number | null = null
  for (const issue of issues) {
    events += issue.count
    if (issue.status === 'unresolved') unresolved++
    if (now - issue.firstSeen < DAY) newIn24h++
    if (lastEventAt === null || issue.lastSeen > lastEventAt) lastEventAt = issue.lastSeen
  }
  return { unresolved, newIn24h, events, lastEventAt }
}

// ── Paging

export const ISSUES_PER_PAGE = 25

/** One page of `items`. A page past the end is clamped to the last: narrowing the search while
 *  on page 4 lands at the end of the new list, not back at the top. */
export function paginate<T>(items: readonly T[], requested: number, perPage = ISSUES_PER_PAGE) {
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / perPage))
  const page = Math.min(Math.max(1, Math.floor(requested) || 1), pages)
  const start = (page - 1) * perPage
  const end = Math.min(start + perPage, total)
  return {
    items: items.slice(start, end),
    page,
    pages,
    label: total ? `${start + 1}–${end} of ${total}` : '0 of 0',
  }
}
