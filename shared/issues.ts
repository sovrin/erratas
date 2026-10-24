// The issue list's search and paging, as the page and the API share them: the API turns the
// parsed search into SQL (server/core/issues.ts).

// ── Search
// One box, two behaviours: `key:value` narrows a dimension, anything else is free text over the
// title and culprit. Forgiving on purpose: a key nobody registered (`time:12`) is text, since a
// search that silently finds nothing is the worst answer to a typo.

type SearchField = 'stackName' | 'environment' | 'release' | 'level' | 'status'

/** The searchable dimensions, with aliases: people type `env` and `environment`. */
export const SEARCH_FIELDS: Readonly<Record<string, SearchField>> = {
  stack: 'stackName',
  env: 'environment',
  environment: 'environment',
  release: 'release',
  version: 'release',
  level: 'level',
  status: 'status',
}

/** The dimensions as the search box names them, aliases left out. */
export const SEARCH_KEYS = ['status', 'level', 'stack', 'env', 'release']

/** Matched by prefix, not substring: `'unresolved'.includes('resolved')`, so substring matching
 *  answered `status:resolved` with every unresolved issue. Prefix still lets `level:err` reach
 *  `error`. */
export const PREFIX_MATCHED: ReadonlySet<SearchField> = new Set(['status', 'level'])

export interface SearchQuery {
  tags: { key: string; value: string; field: SearchField }[]
  terms: string[]
}

const TOKEN = /^([a-z]+):(.*)$/i

export function parseSearchQuery(raw: string): SearchQuery {
  const query: SearchQuery = { tags: [], terms: [] }
  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    const match = TOKEN.exec(token)
    const key = match?.[1]!.toLowerCase()
    const field = key ? SEARCH_FIELDS[key] : undefined
    // `status:all` is how the status links say "every status".
    if (key === 'status' && match![2]!.toLowerCase() === 'all') continue
    if (key && field) {
      // `env:` with no value yet is half-typed, not a filter: read as text it would empty the list.
      if (match![2]) query.tags.push({ key, value: match![2].toLowerCase(), field })
    } else query.terms.push(token.toLowerCase())
  }
  return query
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

// ── Paging

export const ISSUES_PER_PAGE = 25
