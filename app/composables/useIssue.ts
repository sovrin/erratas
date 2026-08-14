import type { Issue, IssueStatus } from '#shared/domain/types'
import { applyIssueChanges } from '#shared/issues/liveIssues'
import type { Unsubscribe } from '~/repositories/types'

/**
 * One issue, loaded by id — the state behind the issue page.
 *
 * Separate from `useIssueBoard` for the same reason `useWorkspace` is: this is
 * reached by URL and knows nothing about what the list was filtered to. A shared
 * link is a cold load, so it reads its own issue rather than picking one out of a
 * list that may never have been fetched.
 *
 * `notFound` is a state rather than an error. An issue that was deleted, and an
 * issue belonging to another account, are the same answer here — and neither is a
 * malfunction worth an error banner. The page says so plainly instead.
 */
export function useIssue(id: Ref<string>) {
  const { issues: issueRepo } = useRepositories()

  const issue = ref<Issue | null>(null)
  const loading = ref(true)
  const notFound = ref(false)
  const actionError = ref<string | null>(null)

  let unsubscribe: Unsubscribe | null = null
  let disposed = false

  async function load() {
    loading.value = true
    notFound.value = false

    const found = await issueRepo.get(id.value)
    if (disposed) return

    issue.value = found
    notFound.value = found === null
    loading.value = false

    await connect()
  }

  /**
   * Keeps the open issue current.
   *
   * The subscription is project-scoped, because that is the verb the repository
   * has and a per-record one would be a second way to do the same thing. The
   * filter to *this* issue happens here, which also means `applyIssueChanges`
   * does the merging — one issue is just a list of length one, and reusing the
   * rules means a `delete` arriving while somebody reads the page is handled the
   * same way it is in the list rather than by a second implementation.
   */
  async function connect() {
    const current = issue.value
    if (!current) return

    try {
      const opened = await issueRepo.subscribe(current.projectId, (change) => {
        if (change.issue.id !== id.value) return
        const merged = applyIssueChanges(
          issue.value ? [issue.value] : [],
          [change],
          current.projectId,
        )
        issue.value = merged[0] ?? null
        // A delete that arrived from elsewhere — another tab, or a colleague
        // looking at the same link — is the one case where the issue vanishes
        // under the reader. Saying so beats an empty panel.
        if (!issue.value) notFound.value = true
      })

      if (disposed) {
        opened()
        return
      }
      unsubscribe = opened
    } catch {
      // A static page is a working page. Nothing to report.
    }
  }

  function disconnect() {
    unsubscribe?.()
    unsubscribe = null
  }

  watch(id, () => void load(), { immediate: true })

  onScopeDispose(() => {
    disposed = true
    disconnect()
  })

  async function setStatus(next: IssueStatus) {
    const current = issue.value
    if (!current) return

    const previous = current.status
    issue.value = { ...current, status: next }
    try {
      await issueRepo.setStatus(current.id, next)
    } catch {
      issue.value = { ...current, status: previous }
      actionError.value = 'Couldn’t update that issue'
    }
  }

  /**
   * Deletes and reports whether it worked, so the page can decide where to go.
   *
   * Navigation is the caller's business: this composable has no opinion about
   * routes, which is what keeps it testable and keeps the routing decision in the
   * page where it is visible.
   */
  async function remove(): Promise<boolean> {
    const current = issue.value
    if (!current) return false

    try {
      await issueRepo.remove(current.id)
      // Stop the stream first: deleting produces a realtime event for this very
      // record, and letting it arrive would flip `notFound` on and flash "no such
      // issue" for the instant before the route changes.
      disconnect()
      return true
    } catch {
      actionError.value = 'Couldn’t delete that issue'
      return false
    }
  }

  return { issue, loading, notFound, actionError, setStatus, remove }
}
