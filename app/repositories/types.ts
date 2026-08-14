import type { Issue, IssueStatus, Project, Retention, Stack } from '#shared/domain/types'
import type { IssueChange } from '#shared/issues/liveIssues'

/**
 * What the UI is allowed to know about storage: nothing, beyond the verbs below.
 *
 * Components and composables depend on these interfaces; the PocketBase
 * implementations depend on them too. Neither depends on the other, which is
 * the point — swapping the backend, or handing a component a stub in a test,
 * touches one provider and no call sites.
 *
 * Deliberately narrow. There is no generic `find(filter)` here, because a
 * generic query method would leak PocketBase's filter syntax into the UI and
 * this abstraction would stop being one.
 */

/**
 * Tears down a subscription. Deliberately `void` and not `Promise<void>`, even
 * though PocketBase's own unsubscribe is async: callers invoke this from
 * teardown paths (a project switch, a component unmounting) where there is
 * nothing useful to do with the result and awaiting it only invites an
 * unhandled rejection on a page that is already going away.
 */
export type Unsubscribe = () => void

/**
 * Notified that *something* in the collection changed, without saying what.
 *
 * Used where the volume is human-paced — somebody editing their setup — and the
 * cheapest correct answer is to read the list again. Compare
 * `IssueRepository.subscribe`, which hands over the record because the issue
 * stream is machine-paced and re-reading a project per event is exactly the
 * load this product cannot afford.
 */
export type ChangeNotifier = () => void

export interface ProjectDraft {
  name: string
  retention: Retention
}

export interface ProjectRepository {
  /** Every project the signed-in account owns, oldest first. */
  list(): Promise<Project[]>
  create(draft: ProjectDraft): Promise<Project>
  update(id: string, patch: Partial<ProjectDraft>): Promise<Project>
  remove(id: string): Promise<void>
  /** Fires when any project the caller can see changes. */
  subscribe(onChange: ChangeNotifier): Promise<Unsubscribe>
}

export interface StackDraft {
  projectId: string
  name: string
  platform: string
}

export interface StackRepository {
  listForProject(projectId: string): Promise<Stack[]>
  /**
   * Mints the public key as part of creating the stack.
   *
   * The caller does not supply one: a key is meaningless outside a stack, and
   * letting callers pass their own is how two stacks end up sharing one.
   */
  create(draft: StackDraft): Promise<Stack>
  update(id: string, patch: Partial<Pick<Stack, 'name' | 'platform'>>): Promise<Stack>
  remove(id: string): Promise<void>
  /**
   * Fires when any stack the caller can see changes.
   *
   * Worth having even though a stack only changes when a person edits one: the
   * issue list renders `stackName` beside every row, and a rename produces no
   * event on `issues` at all. Without this, a stack renamed in another tab
   * leaves every row here labelled with the old name until a full reload.
   */
  subscribe(onChange: ChangeNotifier): Promise<Unsubscribe>
}

export interface IssueRepository {
  /**
   * Every issue in the project.
   *
   * Filtering, searching, sorting and paging all happen client-side over this
   * array — see `shared/issues`. That is a deliberate ceiling: it is fast and
   * completely testable up to a few thousand issues per project, which is well
   * past what a self-hosted instance holds after retention has run. When a
   * project outgrows it, this signature is where the change lands, and nothing
   * above it has to know.
   */
  listForProject(projectId: string): Promise<Issue[]>
  setStatus(id: string, status: IssueStatus): Promise<Issue>
  remove(id: string): Promise<void>
  /**
   * Streams changes to one project's issues, record and all.
   *
   * This one carries the payload rather than just ringing a bell, because it is
   * the only subscription on the ingest side of the app: a crash loop drives it,
   * not a person. The record is already in the message, so the list is patched
   * from it (`applyIssueChanges`) instead of re-reading the project — which
   * would put a full table scan behind every burst, against the single SQLite
   * writer that ingest is simultaneously trying to write through.
   *
   * Scoped to one project so the stream carries nothing the open page cannot
   * use. Reading is still governed by the collection's API rules, not by this
   * filter, so a subscription cannot see more than a `getList` would.
   */
  subscribe(projectId: string, onChange: (change: IssueChange) => void): Promise<Unsubscribe>
}

/** The set handed to the UI, so a consumer asks for one thing rather than three. */
export interface Repositories {
  projects: ProjectRepository
  stacks: StackRepository
  issues: IssueRepository
}
