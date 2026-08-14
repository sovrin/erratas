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
 * Aliases, kept out of the autocomplete.
 *
 * `env` and `environment` must both *parse* — being wrong about which one this app
 * chose is a bad first experience of a search box — but offering both in a menu
 * would imply they differ. The parser reads `TAG_RESOLVERS`; the menu reads it minus
 * these, so a new dimension still needs exactly one entry above to become both
 * searchable and suggestable.
 */
export const TAG_ALIASES: ReadonlySet<string> = new Set(['environment', 'version', 'app'])

/**
 * What each dimension means, for the autocomplete.
 *
 * Deliberately incomplete-tolerant: a resolver added above with no hint here still
 * appears in the menu, just without a description. The alternative — a hard-coded
 * list of suggestable keys — would silently omit new dimensions, which is the drift
 * the registry exists to prevent.
 */
export const TAG_HINTS: Readonly<Record<string, string>> = {
  status: 'unresolved, resolved or ignored',
  stack: 'which runtime reported it',
  env: 'deployment environment',
  release: 'version that threw',
  level: 'error, warning or info',
  user: 'affected user',
  os: 'operating system',
  browser: 'reporting browser',
  runtime: 'reporting runtime',
}

/**
 * Dimensions matched by prefix rather than substring.
 *
 * Substring matching is right for the free-text dimensions — `os:macos` has to find
 * `macOS 14`, `release:v2.4` has to find `v2.4.1` — but it is actively wrong for a
 * closed set drawn from our own domain, because one member can contain another.
 * `'unresolved'.includes('resolved')` is true, so `status:resolved` listed every
 * unresolved issue: silently the opposite of what was asked for, and the reason the
 * status filter could not simply become a token until this existed.
 *
 * Prefix rather than equality, so partial typing still narrows: `status:res` reaches
 * `resolved` without reaching `unresolved`, and `level:err` reaches `error`.
 */
export const TAG_PREFIX_MATCHED: ReadonlySet<string> = new Set(['status', 'level'])
