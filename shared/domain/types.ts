/**
 * The domain, with no storage in it.
 *
 * Nothing here knows that PocketBase exists. Repositories map rows onto these
 * types at the edge, which is what lets the whole filtering/search/pagination
 * layer below be plain functions over plain data — testable without a database,
 * a browser, or a component.
 */

export type IssueLevel = 'error' | 'warning' | 'info'

export const ISSUE_LEVELS: readonly IssueLevel[] = ['error', 'warning', 'info']

/** `unresolved` is the resting state: an issue exists because something broke. */
export type IssueStatus = 'unresolved' | 'resolved' | 'ignored'

export const ISSUE_STATUSES: readonly IssueStatus[] = ['unresolved', 'resolved', 'ignored']

export type Retention = '30d' | '90d' | 'forever'

export const RETENTIONS: readonly Retention[] = ['30d', '90d', 'forever']

/** One line of source context around a frame. `err` marks the failing line. */
export interface SourceLine {
  n: number
  text: string
  err?: boolean
}

/**
 * A stack frame as the dashboard displays it.
 *
 * Deliberately not the SDK's `StackFrame` (filename/function/lineno/colno):
 * that is the wire shape, and it differs per platform — a PHP frame has no
 * column and a minified browser frame has no useful function name. Ingest
 * flattens whatever arrived into `func` + `loc` once, so the UI never has to
 * reassemble a location string per platform.
 */
export interface DisplayFrame {
  func?: string
  loc?: string
  code?: SourceLine[]
}

/** One runtime inside a project — the frontend, the API, a worker. Owns a DSN. */
export interface Stack {
  id: string
  projectId: string
  name: string
  /** Free text; only decides which install snippet is shown. */
  platform: string
  /** Public by design — it ships in browser bundles. Routes writes, grants nothing. */
  publicKey: string
}

export interface Project {
  id: string
  name: string
  retention: Retention
}

/**
 * A distinct bug, not a report of one — thousands of events collapse into this
 * by fingerprint.
 *
 * `count`/`users` are running totals maintained at ingest, and the context
 * fields hold the *most recent* values seen rather than a history: the question
 * a reader is asking is "where is this happening now".
 */
export interface Issue {
  id: string
  projectId: string
  stackId: string
  fingerprint: string
  title: string
  culprit: string
  level: IssueLevel
  status: IssueStatus
  count: number
  users: number
  /** ISO 8601, or null when never recorded. Never a pre-rendered "9d ago". */
  firstSeen: string | null
  lastSeen: string | null
  environment: string
  release: string
  user: string
  os: string
  browser: string
  runtime: string
  frames: DisplayFrame[]
}
