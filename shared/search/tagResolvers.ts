import type { Issue } from '../domain/types'

/**
 * The searchable tags — `env:production`, `release:v2.4`, `user:lea`.
 *
 * This registry is the extension point for search. Adding a dimension means
 * adding one entry here; the parser, the matcher and the clickable tags in the
 * issue detail all read from it and none of them need to change. That is the
 * whole reason it is a lookup table rather than a switch inside the matcher.
 *
 * Aliases are first-class: people type `env` and `environment`, `release` and
 * `version`, and being wrong about which one this app chose is a bad first
 * experience of a search box.
 */

/**
 * What a resolver needs beyond the issue itself.
 *
 * Only stack names so far — an issue stores a stack *id*, but nobody searches
 * for `stack:pbc3f9x2k1m4n5o`.
 */
export interface TagContext {
  stackName: (stackId: string) => string
}

export type TagResolver = (issue: Issue, ctx: TagContext) => string | null | undefined

export const TAG_RESOLVERS: Readonly<Record<string, TagResolver>> = {
  stack: (issue, ctx) => ctx.stackName(issue.stackId),
  env: (issue) => issue.environment,
  environment: (issue) => issue.environment,
  release: (issue) => issue.release,
  version: (issue) => issue.release,
  app: (issue) => issue.release,
  level: (issue) => issue.level,
  status: (issue) => issue.status,
  user: (issue) => issue.user,
  os: (issue) => issue.os,
  browser: (issue) => issue.browser,
  runtime: (issue) => issue.runtime,
}

/**
 * The canonical name for each dimension, used when the UI writes a token *into*
 * the search box (clicking a tag in an issue's detail). Aliases are accepted on
 * the way in but never produced on the way out, so the box stays consistent.
 */
export const CANONICAL_TAG_KEYS = [
  'stack',
  'env',
  'release',
  'level',
  'status',
  'user',
  'os',
  'browser',
  'runtime',
] as const

export type CanonicalTagKey = (typeof CANONICAL_TAG_KEYS)[number]
