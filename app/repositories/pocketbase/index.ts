import type PocketBase from 'pocketbase'

import type { Issue, IssueStatus, Project, Stack } from '#shared/domain/types'
import type { IssueChange, IssueChangeAction } from '#shared/issues/liveIssues'

import type {
  ChangeNotifier,
  IssueRepository,
  ProjectDraft,
  ProjectRepository,
  Repositories,
  StackDraft,
  StackRepository,
  Unsubscribe,
} from '../types'
import { toIssue, toProject, toStack } from './mappers'

/**
 * The PocketBase side of the repository interfaces.
 *
 * This is the only place in the app that knows collection names, filter syntax
 * or the SDK's shape. Everything above it sees the six verbs in `../types.ts`.
 *
 * All of it goes through the `/pb` proxy — the client is built as
 * `new PocketBase('/pb')` in the plugin, so nothing here needs a base URL.
 */

/** Escapes a value for interpolation into a PocketBase filter string. */
function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

/**
 * A page size well past what any single project holds, used where the API wants
 * a limit but the domain wants "all of them" — see `IssueRepository.listForProject`
 * for why reading the whole set is the deliberate choice here.
 */
const MAX_ROWS = 500

/**
 * Realtime subscriptions all funnel through here.
 *
 * What is normalised is the teardown: PocketBase's unsubscribe is
 * `() => Promise<void>`, and the paths that call it — a project switch, a
 * component unmounting — have nothing to await it for. Swallowing the promise
 * once here beats a forgotten `void` at a call site becoming an unhandled
 * rejection on a page that is already going away.
 *
 * Failures are deliberately *not* swallowed. Opening the stream is a network call
 * like any other and can reject; handing back a no-op would leave the caller
 * believing it is live, and an indicator that claims to be live while nothing
 * arrives is worse than one that admits it isn't. Callers decide what a dead
 * stream means to them.
 */
async function subscribeTo(
  pb: PocketBase,
  collection: string,
  handler: (event: { action: string; record: Record<string, unknown> }) => void,
  options?: { filter: string },
): Promise<Unsubscribe> {
  const unsubscribe = await pb
    .collection(collection)
    // The SDK's callback type is generic over the record; the handlers here
    // narrow it themselves through the mappers.
    .subscribe('*', handler as never, options)

  return () => {
    void unsubscribe()
  }
}

const CHANGE_ACTIONS: readonly IssueChangeAction[] = ['create', 'update', 'delete']

function asChangeAction(action: string): IssueChangeAction | null {
  return (CHANGE_ACTIONS as readonly string[]).includes(action)
    ? (action as IssueChangeAction)
    : null
}

export function createPocketBaseProjectRepository(pb: PocketBase): ProjectRepository {
  return {
    async list(): Promise<Project[]> {
      // No owner filter: the list rule is `@request.auth.id = owner.id`, so the
      // API cannot return anybody else's. Repeating it here as a filter would
      // duplicate the access control in a place that is easy to forget to
      // update, and would suggest the rule is not trusted.
      const records = await pb.collection('projects').getFullList({
        sort: 'created',
        requestKey: 'projects-list',
      })
      return records.map(toProject)
    },

    async create(draft: ProjectDraft): Promise<Project> {
      // `owner` is not sent: `ownership.pb.js` stamps it from the authenticated
      // caller and overwrites whatever arrives. Sending one would imply the
      // client gets a say.
      return toProject(await pb.collection('projects').create(draft))
    },

    async update(id: string, patch: Partial<ProjectDraft>): Promise<Project> {
      return toProject(await pb.collection('projects').update(id, patch))
    },

    async remove(id: string): Promise<void> {
      await pb.collection('projects').delete(id)
    },

    // Unfiltered: the list rule already limits the stream to this account's
    // projects, and there is no narrower question to ask — every project the
    // caller can see is one the switcher shows.
    subscribe(onChange: ChangeNotifier): Promise<Unsubscribe> {
      return subscribeTo(pb, 'projects', () => onChange())
    },
  }
}

export function createPocketBaseStackRepository(pb: PocketBase): StackRepository {
  return {
    async listForProject(projectId: string): Promise<Stack[]> {
      const records = await pb.collection('stacks').getFullList({
        filter: `project = ${quote(projectId)}`,
        sort: 'created',
        requestKey: `stacks-${projectId}`,
      })
      return records.map(toStack)
    },

    async create(draft: StackDraft): Promise<Stack> {
      // `publicKey` is not sent — `ownership.pb.js` mints it and overwrites
      // anything that arrives, so that a client cannot probe for keys that
      // already exist by trying to claim them.
      const record = await pb.collection('stacks').create({
        project: draft.projectId,
        name: draft.name,
        platform: draft.platform,
      })
      return toStack(record)
    },

    async update(id: string, patch: Partial<Pick<Stack, 'name' | 'platform'>>): Promise<Stack> {
      return toStack(await pb.collection('stacks').update(id, patch))
    },

    async remove(id: string): Promise<void> {
      await pb.collection('stacks').delete(id)
    },

    subscribe(onChange: ChangeNotifier): Promise<Unsubscribe> {
      return subscribeTo(pb, 'stacks', () => onChange())
    },
  }
}

export function createPocketBaseIssueRepository(pb: PocketBase): IssueRepository {
  return {
    async listForProject(projectId: string): Promise<Issue[]> {
      const records = await pb.collection('issues').getList(1, MAX_ROWS, {
        filter: `project = ${quote(projectId)}`,
        sort: '-lastSeen',
        requestKey: `issues-${projectId}`,
      })
      return records.items.map(toIssue)
    },

    async setStatus(id: string, status: IssueStatus): Promise<Issue> {
      return toIssue(await pb.collection('issues').update(id, { status }))
    },

    async remove(id: string): Promise<void> {
      await pb.collection('issues').delete(id)
    },

    subscribe(projectId: string, onChange: (change: IssueChange) => void): Promise<Unsubscribe> {
      return subscribeTo(
        pb,
        'issues',
        (event) => {
          const action = asChangeAction(event.action)
          // An action this SDK version does not model is dropped at the
          // boundary, the same way `mappers.ts` drops a frame it cannot read:
          // the list goes stale rather than acting on a guess.
          if (!action) return
          onChange({ action, issue: toIssue(event.record as never) })
        },
        { filter: `project = ${quote(projectId)}` },
      )
    },
  }
}

export function createPocketBaseRepositories(pb: PocketBase): Repositories {
  return {
    projects: createPocketBaseProjectRepository(pb),
    stacks: createPocketBaseStackRepository(pb),
    issues: createPocketBaseIssueRepository(pb),
  }
}
