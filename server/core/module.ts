// erratas as a nexitas module: its schema, the ingest route apps report to, and what it says about
// a project. The owner's sign-in, the /api guard and the projects are the core's.
import type { H3Event } from 'h3'
import type { NexitasModule } from '#nexitas/shared/modules'
import { projectCors } from '#nexitas/server/utils/cors'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { MAX_EVENT_BYTES } from './ingest'
import { countUnresolved, deleteProjectStacks, getStack, listNewIssues, listStacks } from './issues'

export const erratas: NexitasModule = {
  id: 'erratas',
  migrations: [
    // A stack is one runtime of a project, with its own DSN key. An issue is a distinct bug, not
    // a report of one: events collapse into it by fingerprint, unique per stack, so the same
    // exception in the frontend and the backend stays two issues. `count` is a running total;
    // environment, release, culprit and frames are the newest seen. No event, address or user
    // agent is kept.
    `CREATE TABLE stacks (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL, platform TEXT NOT NULL, public_key TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX stacks_project ON stacks(project_id);
    CREATE TABLE issues (
      id TEXT PRIMARY KEY, stack_id TEXT NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL, title TEXT NOT NULL, culprit TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('error', 'warning', 'info')),
      status TEXT NOT NULL CHECK (status IN ('unresolved', 'resolved', 'ignored')),
      count INTEGER NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
      environment TEXT NOT NULL, release TEXT NOT NULL, frames TEXT NOT NULL,
      UNIQUE (stack_id, fingerprint)
    );
    CREATE INDEX issues_status ON issues(status);`,
  ],
  // Apps report from browsers anywhere and from servers, which send no Origin. Nobody reads the
  // answer, so a refusal is JSON for whoever debugs an app in its network panel.
  publicRoutes: [
    {
      path: /^\/v1\/errors\/([0-9a-f]{12})$/,
      maxBody: MAX_EVENT_BYTES,
      json: true,
      guard: cors,
    },
  ],
  // Everything erratas serves; switched off, all of it answers 404 and no report is kept.
  paths: ['/errors', '/api/errors', '/v1/errors'],
  projectStatus: (db, projectId) => {
    if (!listStacks(db, projectId).length) return []
    const unresolved = countUnresolved(db, projectId)
    const to = `/p/${projectId}/errors?q=status:unresolved`
    return [
      unresolved
        ? { text: `${unresolved} unresolved`, to, tone: 'warning', figure: String(unresolved) }
        : { text: 'nothing unresolved', to, figure: '0' },
    ]
  },
  projectActivity: (db, projectId, since) =>
    listNewIssues(db, projectId, since).map((issue) => ({
      at: issue.at,
      title: `New ${issue.level === 'info' ? 'notice' : issue.level}`,
      detail: issue.title,
      to: `/p/${projectId}/errors/${issue.id}`,
    })),
  deleteProject: (db, projectId) => deleteProjectStacks(db, projectId),
}

/** A browser may report only from one of the project's own origins, and then gets CORS for it;
 *  a server sends no Origin and is let through to the key check. */
function cors(event: H3Event, match: RegExpExecArray | null) {
  return projectCors(event, getStack(nexitasDatabase(), match?.[1] ?? '')?.projectId, {
    methods: 'POST',
    refusal: 'This site may not report to this stack.',
    originless: true,
  })
}
