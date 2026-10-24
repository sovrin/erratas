// A project's stacks and the issues their events collapse into. A stack owns its issues; deleting
// one deletes them (foreign keys cascade, see module.ts).
import { randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type {
  DisplayFrame,
  Issue,
  IssueDetail,
  IssuesPage,
  IssueStatus,
  Stack,
} from '../../shared/contracts'
import { PREFIX_MATCHED, type SearchQuery } from '../../shared/issues'
import { fingerprintOf, type IngestEvent } from './ingest'

const newId = (bytes: number) => randomBytes(bytes).toString('hex')
const DAY = 24 * 60 * 60 * 1000

// ── Stacks

interface StackRow {
  id: string
  project_id: string
  name: string
  platform: string
  public_key: string
}

const toStack = (row: StackRow): Stack => ({
  id: row.id,
  projectId: row.project_id,
  name: row.name,
  platform: row.platform,
  publicKey: row.public_key,
})

export function listStacks(db: DatabaseSync, projectId: string): Stack[] {
  return (
    db
      .prepare('SELECT * FROM stacks WHERE project_id = ? ORDER BY created_at, id')
      .all(projectId) as unknown as StackRow[]
  ).map(toStack)
}

export function getStack(db: DatabaseSync, id: string): Stack | null {
  const row = db.prepare('SELECT * FROM stacks WHERE id = ?').get(id) as StackRow | undefined
  return row ? toStack(row) : null
}

/** A new stack, with its key minted here: the key only routes reports, but it must be unique,
 *  since ingest finds the stack by it. */
export function createStack(
  db: DatabaseSync,
  projectId: string,
  settings: { name: string; platform: string },
  now = Date.now(),
) {
  const id = newId(6)
  db.prepare(
    `INSERT INTO stacks (id, project_id, name, platform, public_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, projectId, settings.name, settings.platform, newId(16), now)
  return getStack(db, id)!
}

/** Whether the project had the stack to delete. */
export function deleteStack(db: DatabaseSync, projectId: string, id: string) {
  return (
    db.prepare('DELETE FROM stacks WHERE id = ? AND project_id = ?').run(id, projectId).changes > 0
  )
}

/** Everything erratas keeps for a project: its stacks, and with them their issues. */
export function deleteProjectStacks(db: DatabaseSync, projectId: string) {
  db.prepare('DELETE FROM stacks WHERE project_id = ?').run(projectId)
}

// ── Issues

interface IssueRow {
  id: string
  stack_id: string
  stack_name: string
  title: string
  culprit: string
  level: Issue['level']
  status: IssueStatus
  count: number
  first_seen: number
  last_seen: number
  environment: string
  release: string
  frames?: string
}

const ISSUE_COLUMNS = `i.id, i.stack_id, s.name AS stack_name, i.title, i.culprit,
  i.level, i.status, i.count, i.first_seen, i.last_seen, i.environment, i.release`

const toIssue = (row: IssueRow): Issue => ({
  id: row.id,
  stackId: row.stack_id,
  stackName: row.stack_name,
  title: row.title,
  culprit: row.culprit,
  level: row.level,
  status: row.status,
  count: row.count,
  firstSeen: row.first_seen,
  lastSeen: row.last_seen,
  environment: row.environment,
  release: row.release,
})

// Each search dimension's column.
const SEARCH_COLUMNS = {
  stackName: 's.name',
  environment: 'i.environment',
  release: 'i.release',
  level: 'i.level',
  status: 'i.status',
} as const

const likeEscaped = (text: string) => text.replace(/[\\%_]/g, '\\$&')

/** One page of a project's issues matching a search (shared/issues.ts), without their stack
 *  traces, newest first. `keep` (the open issue) stays whatever the search, so the list beside it
 *  never loses the row it is showing. A page past the end is the last: narrowing the search while
 *  on page 4 lands at the end of the new list, not back at the top. */
// shortcut: LIKE scans the project's issues, fine for tens of thousands; move to an FTS5 index if
// searches get slow. Case folds for ASCII only.
export function issuesPage(
  db: DatabaseSync,
  projectId: string,
  {
    query,
    page,
    pageSize,
    keep = '',
  }: { query: SearchQuery; page: number; pageSize: number; keep?: string },
  now = Date.now(),
): IssuesPage {
  const where: string[] = []
  const params: string[] = []
  for (const tag of query.tags) {
    where.push(`${SEARCH_COLUMNS[tag.field]} LIKE ? ESCAPE '\\'`)
    const value = likeEscaped(tag.value)
    params.push(PREFIX_MATCHED.has(tag.field) ? `${value}%` : `%${value}%`)
  }
  for (const term of query.terms) {
    where.push(`(i.title || ' ' || i.culprit) LIKE ? ESCAPE '\\'`)
    params.push(`%${likeEscaped(term)}%`)
  }
  const matching = `FROM issues i JOIN stacks s ON s.id = i.stack_id
    WHERE s.project_id = ? AND (i.id = ? OR (${where.join(' AND ') || 'TRUE'}))`
  const { total } = db
    .prepare(`SELECT COUNT(*) AS total ${matching}`)
    .get(projectId, keep, ...params) as { total: number }
  const at = Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / pageSize)))
  const rows = db
    .prepare(`SELECT ${ISSUE_COLUMNS} ${matching} ORDER BY i.last_seen DESC, i.id LIMIT ? OFFSET ?`)
    .all(projectId, keep, ...params, pageSize, (at - 1) * pageSize) as unknown as IssueRow[]
  const summary = db
    .prepare(
      `SELECT COUNT(*) AS issues, COALESCE(SUM(i.status = 'unresolved'), 0) AS unresolved,
        COALESCE(SUM(i.status = 'resolved'), 0) AS resolved,
        COALESCE(SUM(i.status = 'ignored'), 0) AS ignored,
        COALESCE(SUM(i.first_seen > ?), 0) AS newIn24h, COALESCE(SUM(i.count), 0) AS events,
        MAX(i.last_seen) AS lastEventAt
      FROM issues i JOIN stacks s ON s.id = i.stack_id WHERE s.project_id = ?`,
    )
    .get(now - DAY, projectId) as unknown as IssuesPage['summary']
  return { items: rows.map(toIssue), page: at, total, summary: { ...summary } }
}

export function getIssue(db: DatabaseSync, projectId: string, id: string): IssueDetail | null {
  const row = db
    .prepare(
      `SELECT ${ISSUE_COLUMNS}, i.frames FROM issues i JOIN stacks s ON s.id = i.stack_id
      WHERE i.id = ? AND s.project_id = ?`,
    )
    .get(id, projectId) as IssueRow | undefined
  return row ? { ...toIssue(row), frames: JSON.parse(row.frames!) as DisplayFrame[] } : null
}

// A project's issue is one under one of its stacks.
const IN_PROJECT = 'stack_id IN (SELECT id FROM stacks WHERE project_id = ?)'

export function setIssueStatus(
  db: DatabaseSync,
  projectId: string,
  id: string,
  status: IssueStatus,
) {
  db.prepare(`UPDATE issues SET status = ? WHERE id = ? AND ${IN_PROJECT}`).run(
    status,
    id,
    projectId,
  )
}

export function deleteIssue(db: DatabaseSync, projectId: string, id: string) {
  db.prepare(`DELETE FROM issues WHERE id = ? AND ${IN_PROJECT}`).run(id, projectId)
}

export function countUnresolved(db: DatabaseSync, projectId: string) {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM issues i JOIN stacks s ON s.id = i.stack_id
        WHERE i.status = 'unresolved' AND s.project_id = ?`,
      )
      .get(projectId) as { n: number }
  ).n
}

/** Files an event under its issue, opening the issue the first time if `mayOpen` agrees; null
 *  when it does not. Synchronous from lookup to write, so two events for a new bug cannot both
 *  open it. */
export function recordEvent(
  db: DatabaseSync,
  stackId: string,
  event: IngestEvent,
  mayOpen = () => true,
) {
  const fingerprint = fingerprintOf(event)
  const existing = db
    .prepare('SELECT id, last_seen FROM issues WHERE stack_id = ? AND fingerprint = ?')
    .get(stackId, fingerprint) as { id: string; last_seen: number } | undefined
  if (!existing) {
    if (!mayOpen()) return null
    const id = newId(8)
    db.prepare(
      `INSERT INTO issues (id, stack_id, fingerprint, title, culprit, level, status, count,
        first_seen, last_seen, environment, release, frames)
      VALUES (?, ?, ?, ?, ?, ?, 'unresolved', 1, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      stackId,
      fingerprint,
      event.title,
      event.culprit,
      event.level,
      event.timestamp,
      event.timestamp,
      event.environment,
      event.release,
      JSON.stringify(event.frames),
    )
    return id
  }
  // An offline client flushing its queue sends old events: they count, but never move the issue
  // back in time or overwrite where it happens now.
  if (event.timestamp < existing.last_seen) {
    db.prepare('UPDATE issues SET count = count + 1 WHERE id = ?').run(existing.id)
    return existing.id
  }
  // The newest event says where it happens now, but a report without a release does not erase
  // the known one, and one without a stack keeps the last trace. A resolved issue that recurs is
  // a regression and reopens; an ignored one stays ignored, as asked.
  const traced = event.frames.length > 0
  db.prepare(
    `UPDATE issues SET count = count + 1, last_seen = ?,
      environment = COALESCE(NULLIF(?, ''), environment),
      release = COALESCE(NULLIF(?, ''), release),
      frames = COALESCE(?, frames), culprit = COALESCE(?, culprit),
      status = CASE status WHEN 'resolved' THEN 'unresolved' ELSE status END
    WHERE id = ?`,
  ).run(
    event.timestamp,
    event.environment,
    event.release,
    traced ? JSON.stringify(event.frames) : null,
    traced ? event.culprit : null,
    existing.id,
  )
  return existing.id
}

/** Issues the project's stacks first reported since `since`, newest first: the news on its
 *  overview. A known issue happening again is not news; its count says so on the list. */
export function listNewIssues(db: DatabaseSync, projectId: string, since: number) {
  return db
    .prepare(
      `SELECT i.id, i.title, i.level, i.first_seen AS at FROM issues i
      JOIN stacks s ON s.id = i.stack_id
      WHERE s.project_id = ? AND i.first_seen > ?
      ORDER BY i.first_seen DESC LIMIT 30`,
    )
    .all(projectId, since) as { id: string; title: string; level: string; at: number }[]
}
