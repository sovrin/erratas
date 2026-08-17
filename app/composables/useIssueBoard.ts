import { useIntervalFn } from '@vueuse/core'

import type { Issue } from '#shared/domain/types'
import {
  environmentsIn,
  selectIssues,
  summarise,
  type DimensionFilter,
  type StatusSelection,
} from '#shared/issues/issueQuery'
import { applyIssueChanges, type IssueChange } from '#shared/issues/liveIssues'
import { ISSUES_PER_PAGE, paginate } from '#shared/issues/pagination'
import { appendSearchToken, parseSearchQuery } from '#shared/search/searchQuery'
import type { Unsubscribe } from '~/repositories/types'

/**
 * The issue list: what is loaded, what is being filtered, what is on screen.
 *
 * All the actual thinking lives in `shared/issues` and `shared/search` as pure
 * functions over arrays. This composable only holds the reactive state and
 * wires it to the repository — which is why the filtering rules are unit-tested
 * without a component, a browser, or a database.
 */

/**
 * How often pooled changes land, in ms.
 *
 * Changes are applied on a *fixed cadence* rather than debounced, and the
 * difference matters here more than it would anywhere else in this app. A
 * trailing debounce restarts its timer on every event, so a crash loop —
 * precisely the moment somebody is staring at this page — would push the flush
 * out indefinitely and freeze the screen for as long as the loop ran. A fixed
 * interval guarantees the list moves twice a second no matter how hard ingest is
 * being hit, and puts a ceiling on how often the filter/count/page chain
 * recomputes: two runs a second, whether that burst held five events or five
 * thousand.
 */
const FLUSH_INTERVAL_MS = 500
export function useIssueBoard(projectId: Ref<string | null>, stackName: (id: string) => string) {
  const { issues: issueRepo } = useRepositories()

  const issues = useState<Issue[]>('issues', () => [])
  const loading = useState('issues-loading', () => false)
  const loadError = useState<string | null>('issues-error', () => null)

  /*
   * Filters live in `useState`, not `ref`.
   *
   * Opening an issue is a route change now, which unmounts this page — and plain
   * refs would be rebuilt on the way back, dropping the reader's filter, search
   * and page number every time they looked at something. Triage is "open, read,
   * back, next", so losing the list's position on every hop would make the list
   * unusable in exactly the flow it exists for.
   */
  const status = useState<StatusSelection>('issues-status', () => 'unresolved')
  const stackId = useState<string | 'all'>('issues-stack', () => 'all')
  const environment = useState<string | 'all'>('issues-environment', () => 'all')
  const search = useState('issues-search', () => '')
  const page = useState('issues-page', () => 1)

  /**
   * Changes that have arrived but are not on screen yet, keyed by issue id.
   *
   * A Map rather than an array, because keying by id *is* the coalescing: an
   * issue hit two hundred times in one flush window collapses to its latest
   * state, so the pool is bounded by the number of distinct issues changing
   * rather than by how fast events arrive. Each change carries the whole record,
   * which is what makes last-one-wins the correct merge rather than a lossy one.
   *
   * Outside reactivity on purpose — the pool is a staging area, and making it a
   * `ref` would wake the computed chain on arrival, which is the exact cost the
   * pooling exists to avoid.
   */
  const pool = new Map<string, IssueChange>()

  /**
   * Whether the last attempt to open the stream succeeded.
   *
   * Starts `true`, which is the whole subtlety: this drives a "live updates
   * offline" notice, and a pessimistic default would flash that claim on first
   * paint — before any attempt has been made — and again on every project switch,
   * in the gap between tearing one subscription down and the next one resolving.
   * Only a failed subscribe clears it, so the notice means "we tried and could
   * not" rather than "we have not tried yet".
   */
  const live = ref(true)
  let unsubscribe: Unsubscribe | null = null
  let disposed = false

  async function load() {
    const id = projectId.value
    if (!id) {
      issues.value = []
      return
    }

    loading.value = true
    loadError.value = null
    try {
      issues.value = await issueRepo.listForProject(id)
    } catch {
      loadError.value = 'Couldn’t load issues'
    } finally {
      loading.value = false
    }
  }

  function receive(change: IssueChange) {
    pool.set(change.issue.id, change)
  }

  /**
   * Changes wait only while a fresh read is replacing the list wholesale.
   *
   * There used to be a second condition here — hold everything while a row was
   * expanded — because every destructive control lived inside that expanded row
   * and the list reorders on `lastSeen`, so an arriving event could slide a
   * different issue under an armed delete button. Moving the detail view to its
   * own route removed the hazard rather than mitigating it: nothing on this list
   * is destructive now, so a row shifting costs a wrong navigation and a press of
   * Back. The pause, the pending count and the notice that explained them all
   * went with it.
   */
  const canFlush = computed(() => !loading.value)

  function flush() {
    if (pool.size === 0) return

    const changes = [...pool.values()]
    pool.clear()
    // `applyIssueChanges` returns the same array when nothing applied, so a
    // flush carrying only changes for a closed project does not re-render.
    issues.value = applyIssueChanges(issues.value, changes, projectId.value)
  }

  useIntervalFn(() => {
    if (canFlush.value) flush()
  }, FLUSH_INTERVAL_MS)

  // A finished read is the moment anything pooled during it should land.
  watch(canFlush, (allowed) => {
    if (allowed) flush()
  })

  // Deliberately leaves `live` alone: tearing a subscription down on the way to
  // opening the next one is not an outage, and flipping the flag here would put
  // the offline notice on screen for the length of every project switch.
  function disconnect() {
    unsubscribe?.()
    unsubscribe = null
    pool.clear()
  }

  /**
   * Points the stream at whichever project is open.
   *
   * Subscribing is attempted *before* the matching `load()` runs, which is the
   * less obvious ordering and the right one: events that arrive during the read
   * are pooled (`canFlush` is false while `loading`) and land on top of the
   * fresh snapshot afterwards. Connect after the read instead and every event in
   * that window is simply lost — during a crash loop, that is a new issue
   * missing from the list with nothing to hint at it until a manual reload.
   */
  async function connect() {
    disconnect()

    const id = projectId.value
    if (!id) return

    let opened: Unsubscribe
    try {
      opened = await issueRepo.subscribe(id, receive)
    } catch {
      // A dead stream is not a broken page: the list has loaded, every filter
      // and every action still works, it just stops moving on its own. Raising
      // `loadError` here would put a failure banner over a page that is fine.
      // `live` carries it instead, quietly.
      live.value = false
      return
    }

    // The project changed again, or the page went away, while that call was in
    // flight. Close what we just opened instead of holding a stream for a
    // project nobody is looking at.
    if (disposed || projectId.value !== id) {
      opened()
      return
    }

    unsubscribe = opened
    live.value = true
  }

  watch(projectId, () => void connect(), { immediate: true })

  // The stream holds an SSE connection and a server-side subscription; leaving
  // either behind on unmount leaks both, and the stale callback would keep
  // pooling changes into a list nothing is rendering.
  onScopeDispose(() => {
    disposed = true
    disconnect()
  })

  // Any change to what is being asked for invalidates the page number and the
  // open row: page 4 of the old result set is meaningless in the new one, and
  // an expanded issue that just got filtered out would leave its detail panel
  // orphaned on screen.
  watch([status, stackId, environment, search], () => {
    page.value = 1
  })

  // A project switch resets everything, including the filters — carrying
  // `stack:frontend` into a project with no such stack shows an empty list that
  // looks like "no errors" rather than "wrong filter".
  watch(projectId, async () => {
    status.value = 'unresolved'
    stackId.value = 'all'
    environment.value = 'all'
    search.value = ''
    page.value = 1
    await load()
  })

  const query = computed(() => parseSearchQuery(search.value))
  const ctx = computed(() => ({ stackName }))

  const selection = computed(() =>
    selectIssues(issues.value, {
      filter: { stackId: stackId.value, environment: environment.value } satisfies DimensionFilter,
      status: status.value,
      query: query.value,
      ctx: ctx.value,
    }),
  )

  const currentPage = computed(() => paginate(selection.value.visible, page.value, ISSUES_PER_PAGE))
  const environments = computed(() => environmentsIn(issues.value))
  const hasSearch = computed(() => search.value.length > 0)

  function summary(stackCount: number) {
    return summarise(issues.value, stackCount)
  }

  /**
   * Narrows the search to a tag, as the issue page's tag grid asks for.
   *
   * The issue page cannot do this itself — it has no search box — so it navigates
   * here with the token in the URL and this applies it. Which also means a
   * narrowed list has an address, the same way a single issue now does.
   */
  function narrowBy(key: string, value: string) {
    search.value = appendSearchToken(search.value, key, value)
  }

  function clearSearch() {
    search.value = ''
  }

  function goToPage(next: number) {
    page.value = next
  }

  return {
    issues,
    loading,
    loadError,
    status,
    stackId,
    environment,
    search,
    hasSearch,
    selection,
    currentPage,
    environments,
    live,
    load,
    summary,
    narrowBy,
    clearSearch,
    goToPage,
  }
}
