import type { Issue } from '../domain/types'

/**
 * Folding a stream of changes into the loaded issue list.
 *
 * The dashboard's list is a snapshot: `IssueRepository.listForProject` reads the
 * whole project once and everything on screen derives from that array. Realtime
 * is the other half of that bargain — rather than re-reading the project every
 * time an event lands, the rows the reader already has are patched in place.
 *
 * All of the reasoning lives here, as a pure function over plain arrays, for the
 * same reason the filtering rules do: this is the code that decides whether a
 * new bug shows up at all, and it should be provable without a browser, a
 * database or an open SSE connection.
 *
 * Note what this deliberately does *not* do: sort. Order is `selectIssues`'
 * job — it sorts by `lastSeen` on every read — so an insert here can go
 * anywhere and a changed timestamp needs no resort.
 */

export type IssueChangeAction = 'create' | 'update' | 'delete'

/**
 * One change, carrying the record's full new state rather than a patch.
 *
 * That is what PocketBase's realtime sends, and it is the shape that makes the
 * merge safe: applying the same change twice, or applying two changes for one
 * issue in either order, converges on whatever arrived last instead of
 * accumulating partial edits.
 */
export interface IssueChange {
  action: IssueChangeAction
  issue: Issue
}

/**
 * Applies changes in order and returns the resulting list.
 *
 * `projectId` is the project currently open. Changes for anything else are
 * dropped: the subscription is filtered server-side, but a project switch
 * unsubscribes asynchronously, so one last message from the previous project can
 * still arrive after the reader has moved on. Guarding on the data is reliable
 * in a way that guarding on that timing is not.
 *
 * Returns the *same array reference* when nothing applied. The whole computed
 * chain above this — filtering, counting, paging — is keyed off `issues`, and
 * handing back an equal-but-new array would re-run all of it to redraw an
 * identical screen.
 */
export function applyIssueChanges(
  issues: readonly Issue[],
  changes: readonly IssueChange[],
  projectId: string | null,
): Issue[] {
  let next: Issue[] | null = null

  for (const change of changes) {
    if (!projectId || change.issue.projectId !== projectId) continue

    const current = next ?? issues
    const index = current.findIndex((issue) => issue.id === change.issue.id)

    switch (change.action) {
      case 'delete':
        // A delete for an issue that was never loaded is not a problem to
        // report, it is a change that has already happened.
        if (index === -1) continue
        next = current.filter((issue) => issue.id !== change.issue.id)
        continue

      case 'create':
      case 'update':
        // An `update` for an issue that is not in the list still inserts it, and
        // that is the case worth getting right rather than the obvious one.
        // Ingest *upserts*: a brand-new bug's first event creates the row, and
        // every event after it updates the same row. A dashboard that connected
        // between those two only ever sees updates — treat them as
        // "not-in-the-list means new to me" and the issue appears; require a
        // `create` and it stays invisible until the next full page load.
        //
        // The mirror case is a `create` for an issue already held, which happens
        // when the initial read races the stream. Replacing rather than
        // appending is what stops that becoming a duplicate row.
        next =
          index === -1
            ? [...current, change.issue]
            : current.map((issue) => (issue.id === change.issue.id ? change.issue : issue))
        continue

      default:
        // An action this version does not know about is ignored rather than
        // guessed at. Nothing on the wire produces one today; the branch exists
        // so that if something ever does, the list is stale rather than wrong.
        continue
    }
  }

  return next ?? (issues as Issue[])
}
