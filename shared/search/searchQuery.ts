import type { Issue } from '../domain/types'
import {
  TAG_PREFIX_MATCHED,
  TAG_RESOLVERS,
  type TagContext,
  type TagResolver,
} from './tagResolvers'

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

const TOKEN_PATTERN = /^([a-z]+):(.*)$/i

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
    const value = match?.[2] ?? ''

    if (match && key && resolve) {
      /*
       * `env:` with nothing after it is ignored, not matched.
       *
       * It is the normal half-way state of every autocomplete interaction — accepting
       * a dimension from the menu inserts exactly this and waits for a value — and
       * read as free text it matched nothing, so the list emptied and said "nothing
       * here." in the middle of composing a filter. An unfinished token is not a
       * filter yet; the reader has not asked for anything.
       */
      if (value === '') continue
      tags.push({ key, value: value.toLowerCase(), resolve })
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
 *
 * The exception is `TAG_PREFIX_MATCHED`, and it is not cosmetic: for a closed set
 * where one value contains another, substring matching returns the wrong issues
 * rather than merely too many. See that set for the case that forced it.
 */
export function matchesSearchQuery(issue: Issue, query: SearchQuery, ctx: TagContext): boolean {
  for (const tag of query.tags) {
    const value = tag.resolve(issue, ctx)
    if (!value) return false
    const haystack = String(value).toLowerCase()
    const matched = TAG_PREFIX_MATCHED.has(tag.key)
      ? haystack.startsWith(tag.value)
      : haystack.includes(tag.value)
    if (!matched) return false
  }

  if (query.terms.length === 0) return true

  const haystack = `${issue.title} ${issue.culprit} ${issue.user}`.toLowerCase()
  return query.terms.every((term) => haystack.includes(term))
}

/**
 * Sets a dimension to a value — "filter by this", from a clicked tag or stat.
 *
 * It *replaces* any existing token for the same key rather than appending, which the name
 * `appendSearchToken` promised and which was wrong in both directions. Clicking a tag that
 * was already filtered on produced two identical chips; clicking a *different* value for
 * the same dimension produced two chips that can never both match, since the tags are
 * ANDed and a resolver returns one value per issue — so `env:debug env:production` is a
 * silently empty list. Neither is what a click on a value means.
 *
 * Only the click paths use this. Typing two tokens for one dimension is still allowed by
 * the parser, where it is occasionally meaningful under substring matching
 * (`release:v2 release:v2.4`), and where the reader can see both and delete one.
 *
 * Position is preserved: replacing in place keeps the chip where it was, so changing a
 * value does not make the chip jump to the end of the row.
 *
 * Values are truncated at the first space (`macOS 14` → `macos`) because the search box
 * splits on whitespace, so a two-word value would arrive as a tag plus a stray text term
 * that matches nothing.
 */
export function setSearchToken(current: string, key: string, value: string): string {
  const firstWord = String(value).trim().split(/\s+/)[0] ?? ''
  if (!firstWord) return current.trim()

  const normalisedKey = key.toLowerCase()
  const token = `${normalisedKey}:${firstWord}`
  const isSameKey = (candidate: string) => candidate.toLowerCase().startsWith(`${normalisedKey}:`)

  const tokens = current.trim().split(/\s+/).filter(Boolean)
  const first = tokens.findIndex(isSameKey)
  if (first === -1) return [...tokens, token].join(' ')

  // Replace the first, and drop any later duplicates of the same dimension so setting a
  // value always collapses to exactly one.
  return tokens
    .map((candidate, index) => (index === first ? token : candidate))
    .filter((candidate, index) => index === first || !isSameKey(candidate))
    .join(' ')
}

export interface QueryTag {
  key: string
  value: string
}

export interface SplitQuery {
  /** Complete `key:value` tokens, in the order they appear. */
  tags: QueryTag[]
  /** Everything else, as one string: free text, and any token still being typed. */
  text: string
}

/**
 * Splits a query into the parts the search box draws as chips and the part it leaves
 * in the input.
 *
 * The rule is completeness, not recognition. A *complete* token — a registered key with
 * a value — is settled, so it becomes a chip. Everything else stays editable text, and
 * that deliberately includes two things a chip would swallow:
 *
 *   - **`env:` with no value yet.** Accepting a dimension from the autocomplete produces
 *     exactly this. Classifying it as a tag would make it vanish (the parser ignores
 *     unfinished tokens), and chipping it would trap the reader in a chip with no value.
 *   - **`enviroment:prod`.** An unregistered key is free text to the parser, so drawing
 *     it as a chip would claim a filter is active that isn't. Left as text it stays
 *     visibly a typo.
 *
 * Paired with `composeQuery`, which is its inverse — that round trip is what lets the
 * raw string stay the single source of truth while the box renders chips, so `?q=` and
 * `setSearchToken` keep working without knowing chips exist.
 */
export function splitQuery(
  raw: string,
  resolvers: Readonly<Record<string, TagResolver>> = TAG_RESOLVERS,
): SplitQuery {
  const tags: QueryTag[] = []
  const rest: string[] = []

  for (const token of raw.trim().split(/\s+/)) {
    if (!token) continue
    const match = TOKEN_PATTERN.exec(token)
    const key = match?.[1]?.toLowerCase()
    const value = match?.[2] ?? ''

    if (match && key && resolvers[key] && value !== '') {
      tags.push({ key, value })
    } else {
      rest.push(token)
    }
  }

  return { tags, text: rest.join(' ') }
}

/**
 * Rebuilds a query string from chips and the leftover text — the inverse of `splitQuery`.
 *
 * Chips lead, so the string normalises to "filters, then words" regardless of the order
 * they were typed in. The tokens are ANDed, so this changes nothing about what matches,
 * and it keeps the box from reshuffling as chips are added and removed.
 */
export function composeQuery(tags: readonly QueryTag[], text: string): string {
  return [...tags.map((tag) => `${tag.key}:${tag.value}`), text.trim()]
    .filter((part) => part !== '')
    .join(' ')
}
