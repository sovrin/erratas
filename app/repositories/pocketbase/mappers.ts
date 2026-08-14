import type { RecordModel } from 'pocketbase'

import type {
  DisplayFrame,
  Issue,
  IssueLevel,
  IssueStatus,
  Project,
  Retention,
  SourceLine,
  Stack,
} from '#shared/domain/types'

/**
 * The boundary where PocketBase rows become domain objects.
 *
 * Everything above this file works with `Issue`/`Project`/`Stack` and has no
 * idea what the database calls anything. Keeping the translation in one place
 * means a renamed column is one edit here rather than a search across the app.
 *
 * The reads are defensive on purpose. These rows come back as `RecordModel`,
 * which is `any`-shaped in the SDK's typing, and a field that a migration has
 * not run for yet arrives as `undefined` — coercing here is what stops that
 * becoming `undefined` rendered into the middle of a table cell.
 */

function text(record: RecordModel, field: string): string {
  const value = record[field]
  return typeof value === 'string' ? value : ''
}

function count(record: RecordModel, field: string): number {
  const value = record[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * PocketBase writes `''` for an unset date, not null — so an empty string here
 * means "never", and passing it through as a date string would produce an
 * Invalid Date downstream.
 */
function timestamp(record: RecordModel, field: string): string | null {
  const value = text(record, field)
  return value === '' ? null : value
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

const LEVELS: readonly IssueLevel[] = ['error', 'warning', 'info']
const STATUSES: readonly IssueStatus[] = ['unresolved', 'resolved', 'ignored']
const RETENTIONS: readonly Retention[] = ['30d', '90d', 'forever']

export function toProject(record: RecordModel): Project {
  return {
    id: record.id,
    name: text(record, 'name'),
    retention: oneOf(text(record, 'retention'), RETENTIONS, '90d'),
  }
}

export function toStack(record: RecordModel): Stack {
  return {
    id: record.id,
    projectId: text(record, 'project'),
    name: text(record, 'name'),
    platform: text(record, 'platform'),
    publicKey: text(record, 'publicKey'),
  }
}

export function toIssue(record: RecordModel): Issue {
  return {
    id: record.id,
    projectId: text(record, 'project'),
    stackId: text(record, 'stack'),
    fingerprint: text(record, 'fingerprint'),
    title: text(record, 'title'),
    culprit: text(record, 'culprit'),
    level: oneOf(text(record, 'level'), LEVELS, 'error'),
    // An issue exists because something broke; if the column is somehow
    // unreadable, the safe reading is that it still needs attention.
    status: oneOf(text(record, 'status'), STATUSES, 'unresolved'),
    count: count(record, 'count'),
    users: count(record, 'users'),
    firstSeen: timestamp(record, 'firstSeen'),
    lastSeen: timestamp(record, 'lastSeen'),
    environment: text(record, 'environment'),
    release: text(record, 'release'),
    user: text(record, 'user'),
    os: text(record, 'os'),
    browser: text(record, 'browser'),
    runtime: text(record, 'runtime'),
    frames: toFrames(record.frames),
  }
}

/**
 * `frames` is JSON written by ingest from whatever an SDK sent.
 *
 * It is the one field that is neither validated by a PocketBase field type nor
 * produced by this app, so it is treated as hostile: anything that is not the
 * expected shape is dropped rather than rendered. A stack trace that fails to
 * display is a much smaller problem than a page that fails to render.
 */
function toFrames(value: unknown): DisplayFrame[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((raw): DisplayFrame[] => {
    if (typeof raw !== 'object' || raw === null) return []
    const frame = raw as Record<string, unknown>

    const code = Array.isArray(frame.code) ? frame.code.flatMap(toSourceLine) : []

    return [
      {
        func: typeof frame.func === 'string' ? frame.func : undefined,
        loc: typeof frame.loc === 'string' ? frame.loc : undefined,
        code: code.length > 0 ? code : undefined,
      },
    ]
  })
}

function toSourceLine(line: unknown): SourceLine[] {
  if (typeof line !== 'object' || line === null) return []
  const entry = line as Record<string, unknown>
  if (typeof entry.n !== 'number' || typeof entry.text !== 'string') return []
  return [{ n: entry.n, text: entry.text, err: entry.err === true }]
}
