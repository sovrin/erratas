import type { Issue } from '../domain/types'
import { matchesSearchQuery, parseSearchQuery } from './searchQuery'
import { TAG_ALIASES, TAG_HINTS, TAG_RESOLVERS, type TagContext } from './tagResolvers'

/**
 * Autocomplete for the search box — the only filter control on the board.
 *
 * The status tabs and the stack and environment menus are gone, and this is what
 * replaced them. They were three different widgets for three of the dimensions the
 * search box already understood, which meant the same filter could be expressed two
 * ways and the row grew a control every time a dimension was added. One box that can
 * complete every dimension is both less to look at and more capable: `release`,
 * `level`, `os`, `browser` and `user` never had a control at all.
 *
 * Two things make it worth using rather than just smaller:
 *
 *   - **It answers "what can I even filter by".** The placeholder used to carry that,
 *     as a line of example syntax nobody finishes reading. A menu of dimensions with
 *     descriptions is the same information where it is actually needed.
 *   - **Values come with counts, from the set the other tokens already narrowed.**
 *     That is the property the status tabs had — counts computed *before* the status
 *     filter applied, so they described the list you were looking at — generalised to
 *     every dimension. Typing `env:` on a query already narrowed to one release tells
 *     you where that release is breaking, which no tab row could say.
 */

/**
 * How many *values* the menu will ever show.
 *
 * Values are unbounded — a project can report from a hundred releases — so the list
 * needs a ceiling. The dimensions do not: there are nine, they are a fixed set, and
 * this cap silently hid the ninth (`runtime`) from the one list whose entire job is
 * answering "what can I filter by". Capping a closed set defeats the menu.
 */
export const MAX_SUGGESTIONS = 8

export interface KeySuggestion {
  kind: 'key'
  /** Text that replaces the active token. */
  insert: string
  label: string
  hint: string
}

export interface ValueSuggestion {
  kind: 'value'
  insert: string
  label: string
  /** Issues that would still match if this value were chosen. */
  count: number
}

export type Suggestion = KeySuggestion | ValueSuggestion

export interface SuggestionResult {
  /** Bounds of the token being completed, as indices into the raw query. */
  start: number
  end: number
  suggestions: Suggestion[]
}

const EMPTY: SuggestionResult = { start: 0, end: 0, suggestions: [] }

/** The dimensions offered, in a fixed order so the menu does not reshuffle. */
export function suggestableKeys(
  resolvers: Readonly<Record<string, unknown>> = TAG_RESOLVERS,
): string[] {
  return Object.keys(resolvers).filter((key) => !TAG_ALIASES.has(key))
}

/**
 * The token the caret sits in.
 *
 * Bounds rather than just the text, because completing it means splicing over it —
 * and the caret is not always at the end. Someone who fixes a typo in the middle of
 * `env:prodction release:v2` should be completing `env:`, not the last token.
 */
export function activeTokenAt(raw: string, caret: number): { start: number; end: number } {
  const clamped = Math.max(0, Math.min(caret, raw.length))
  let start = clamped
  while (start > 0 && !/\s/.test(raw[start - 1]!)) start -= 1
  let end = clamped
  while (end < raw.length && !/\s/.test(raw[end]!)) end += 1
  return { start, end }
}

/**
 * Values are truncated at the first space to match `setSearchToken`.
 *
 * The box splits on whitespace, so `macOS 14` has to be offered as `macos` or
 * choosing it would produce a tag plus a stray text term that matches nothing.
 */
function firstWord(value: string): string {
  return value.trim().split(/\s+/)[0] ?? ''
}

export function suggestSearch(options: {
  raw: string
  caret: number
  issues: readonly Issue[]
  ctx: TagContext
  resolvers?: Readonly<Record<string, (issue: Issue, ctx: TagContext) => unknown>>
}): SuggestionResult {
  const { raw, caret, issues, ctx } = options
  const resolvers = options.resolvers ?? TAG_RESOLVERS
  const { start, end } = activeTokenAt(raw, caret)
  const token = raw.slice(start, end)
  const separator = token.indexOf(':')

  // No colon yet: the reader is naming a dimension, or typing free text. Offer the
  // dimensions that still match what they have typed — and nothing at all once the
  // prefix matches none, since a menu of every key under a word that is plainly
  // free text is noise.
  if (separator === -1) {
    const prefix = token.toLowerCase()
    const keys = suggestableKeys(resolvers).filter((key) => key.startsWith(prefix))
    return {
      start,
      end,
      suggestions: keys.map((key) => ({
        kind: 'key' as const,
        insert: `${key}:`,
        label: `${key}:`,
        hint: TAG_HINTS[key] ?? '',
      })),
    }
  }

  const key = token.slice(0, separator).toLowerCase()
  const resolve = resolvers[key]
  if (!resolve) return EMPTY

  const partial = token.slice(separator + 1).toLowerCase()

  /*
   * Counts come from the issues the *other* tokens already narrowed — the active
   * token is spliced out before parsing. Counting against the whole project instead
   * would show `env:production 400` on a query pinned to one release that only broke
   * twice, which is worse than no number: it looks like a result count and is not.
   */
  const rest = `${raw.slice(0, start)}${raw.slice(end)}`
  const restQuery = parseSearchQuery(rest, TAG_RESOLVERS)
  const narrowed = restQuery.isEmpty
    ? issues
    : issues.filter((issue) => matchesSearchQuery(issue, restQuery, ctx))

  const counts = new Map<string, number>()
  for (const issue of narrowed) {
    const resolved = resolve(issue, ctx)
    if (resolved === null || resolved === undefined) continue
    const value = firstWord(String(resolved))
    if (!value || value === '—') continue
    if (partial && !value.toLowerCase().includes(partial)) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  const suggestions = [...counts.entries()]
    // Commonest first — on a triage screen the value with the most issues behind it
    // is the one worth looking at — then alphabetical so equal counts hold still.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_SUGGESTIONS)
    .map(([value, count]) => ({
      kind: 'value' as const,
      insert: `${key}:${value}`,
      label: value,
      count,
    }))

  return { start, end, suggestions }
}

/**
 * Splices a chosen suggestion over the token being completed.
 *
 * A value ends the token, so it is followed by a space and the caret lands ready for
 * the next one. A key is not: the reader is mid-token and about to pick a value, and
 * a space there would turn `env:` into free text.
 *
 * The space is only *added* when there is not one already. Completing a token in the
 * middle of a query — `env:prod release:v2` with the caret after `prod` — otherwise
 * inserts a second separator, and while the parser splits on `\s+` and would not
 * care, the reader watching their own query grow a gap does.
 */
export function applySuggestion(
  raw: string,
  result: SuggestionResult,
  suggestion: Suggestion,
): { raw: string; caret: number } {
  const before = raw.slice(0, result.start)
  const after = raw.slice(result.end)
  const wantsSpace = suggestion.kind === 'value'
  const hasSpace = /^\s/.test(after)
  const inserted = `${suggestion.insert}${wantsSpace && !hasSpace ? ' ' : ''}`
  return {
    raw: `${before}${inserted}${after}`,
    // Step over an existing separator too, so the caret always ends up at the start
    // of the next token rather than behind the space in front of it.
    caret: before.length + inserted.length + (wantsSpace && hasSpace ? 1 : 0),
  }
}
