import type { Issue } from '../domain/types'
import { TAG_RESOLVERS, type TagContext, type TagResolver } from './tagResolvers'

/**
 * One search box, two behaviours: `key:value` narrows a dimension, everything
 * else is free text over the issue's title, culprit and affected user.
 *
 * The parser is deliberately forgiving. A token like `time:12` — a key nobody
 * registered — becomes a *text* term rather than an error or an empty result,
 * because someone typing a colon into a search box almost always means "find me
 * this string", and a search that silently returns nothing is the worst
 * possible answer.
 */

export interface TagFilter {
  key: string
  value: string
  resolve: TagResolver
}

export interface SearchQuery {
  tags: TagFilter[]
  terms: string[]
  isEmpty: boolean
}

const TOKEN_PATTERN = /^([a-z]+):(.+)$/i

export const EMPTY_QUERY: SearchQuery = { tags: [], terms: [], isEmpty: true }

export function parseSearchQuery(
  raw: string,
  resolvers: Readonly<Record<string, TagResolver>> = TAG_RESOLVERS,
): SearchQuery {
  const trimmed = raw.trim()
  if (!trimmed) return EMPTY_QUERY

  const tags: TagFilter[] = []
  const terms: string[] = []

  for (const token of trimmed.split(/\s+/)) {
    const match = TOKEN_PATTERN.exec(token)
    const key = match?.[1]?.toLowerCase()
    const resolve = key ? resolvers[key] : undefined

    if (match && key && resolve) {
      tags.push({ key, value: match[2]!.toLowerCase(), resolve })
    } else {
      terms.push(token.toLowerCase())
    }
  }

  return { tags, terms, isEmpty: tags.length === 0 && terms.length === 0 }
}

/**
 * Every tag and every term must match — the tokens are ANDed.
 *
 * That is the behaviour people expect from adding a word to a search: the
 * result set gets smaller. It is also what makes the clickable tags in an
 * issue's detail useful, since each click appends a token and narrows further.
 *
 * Matching is substring, not equality, so `release:v2.4` finds `v2.4.1` and
 * `os:macos` finds `macOS 14` — the values are human strings from a dozen
 * runtimes and demanding exactness would make the feature unusable.
 */
export function matchesSearchQuery(issue: Issue, query: SearchQuery, ctx: TagContext): boolean {
  for (const tag of query.tags) {
    const value = tag.resolve(issue, ctx)
    if (!value || !String(value).toLowerCase().includes(tag.value)) return false
  }

  if (query.terms.length === 0) return true

  const haystack = `${issue.title} ${issue.culprit} ${issue.user}`.toLowerCase()
  return query.terms.every((term) => haystack.includes(term))
}

/**
 * Appends a token to an existing query string, for "click a tag to filter by it".
 *
 * Values are truncated at the first space (`macOS 14` → `macos`) because the
 * search box splits on whitespace, so a two-word value would arrive as a tag
 * plus a stray text term that matches nothing.
 */
export function appendSearchToken(current: string, key: string, value: string): string {
  const firstWord = String(value).trim().split(/\s+/)[0] ?? ''
  if (!firstWord) return current.trim()
  return `${current} ${key}:${firstWord}`.trim()
}
