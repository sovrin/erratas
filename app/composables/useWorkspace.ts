import { useDebounceFn } from '@vueuse/core'

import type { Project, Retention, Stack } from '#shared/domain/types'
import type { StackDraft, Unsubscribe } from '~/repositories/types'

/**
 * Projects and their stacks — the structural half of the app.
 *
 * Split from `useIssueBoard` on purpose: this changes when somebody edits their
 * setup, that changes constantly as errors arrive. One composable owning both
 * would reload the project list every time an issue was resolved.
 *
 * `useState` rather than a module-level ref, so the data belongs to the Nuxt
 * app instance instead of to the module — the same reason the auth store does.
 */

/**
 * How long a burst of setup changes settles before the lists are re-read, in ms.
 *
 * This side of the app is *debounced*, where the issue list is flushed on a fixed
 * cadence — and the asymmetry is the point. Nothing here moves unless a person
 * moves it, so bursts always end, and a trailing timer that waits for the end of
 * one is both simpler and kinder to a text field being typed into. The issue
 * stream has no such guarantee: a crash loop never stops, and a debounce there
 * would freeze the screen for the duration.
 *
 * Re-reading rather than patching is also right *here* specifically: two lists of
 * a handful of rows each, changing a few times a day, versus an issue stream
 * where a re-read per event would mean a full project scan against the single
 * SQLite writer that ingest is already competing for.
 */
const SETUP_REFRESH_DEBOUNCE_MS = 300

export function useWorkspace() {
  const { projects: projectRepo, stacks: stackRepo } = useRepositories()

  const projects = useState<Project[]>('workspace-projects', () => [])
  const stacks = useState<Stack[]>('workspace-stacks', () => [])
  const currentProjectId = useState<string | null>('workspace-current-project', () => null)
  const loading = useState('workspace-loading', () => false)
  const loadError = useState<string | null>('workspace-error', () => null)

  const currentProject = computed(
    () => projects.value.find((p) => p.id === currentProjectId.value) ?? null,
  )

  /** Stacks belonging to the open project. `stacks` holds only these already. */
  const currentStacks = computed(() => stacks.value)

  const stackName = (stackId: string): string =>
    stacks.value.find((s) => s.id === stackId)?.name ?? stackId

  async function loadStacks(projectId: string) {
    stacks.value = await stackRepo.listForProject(projectId)
  }

  /**
   * Loads the project list and opens one.
   *
   * Keeps the current selection if it still exists, so a refresh triggered by
   * renaming a stack does not throw the reader back to their first project.
   *
   * `silent` is for the realtime refresh: it leaves `loading` alone, because
   * flipping it would blank the setup panel and put "loading…" under the issue
   * list every time somebody in another tab touched a stack, and it swallows the
   * error, because a failed *background* refresh should leave the last good data
   * on screen rather than replace a working page with a banner.
   */
  async function load(options: { silent?: boolean } = {}) {
    const silent = options.silent === true

    if (!silent) {
      loading.value = true
      loadError.value = null
    }

    try {
      projects.value = await projectRepo.list()

      const stillExists = projects.value.some((p) => p.id === currentProjectId.value)
      if (!stillExists) currentProjectId.value = projects.value[0]?.id ?? null

      stacks.value = currentProjectId.value
        ? await stackRepo.listForProject(currentProjectId.value)
        : []
    } catch {
      if (!silent) loadError.value = 'Couldn’t load your projects'
    } finally {
      if (!silent) loading.value = false
    }
  }

  /**
   * Writes this tab has started and not yet finished.
   *
   * Every write here is applied locally first and echoes back as a realtime
   * event, and the event cannot say who caused it. `renameProject` and
   * `updateStack` are bound to an input's every keystroke, so a refresh landing
   * between the local patch and the server's acknowledgement would rewrite the
   * field the reader is still typing into — one stale response and characters
   * appear to vanish. The refresh waits for our own writes to settle instead.
   */
  let writesInFlight = 0

  async function tracked<T>(write: Promise<T>): Promise<T> {
    writesInFlight += 1
    try {
      return await write
    } finally {
      writesInFlight -= 1
    }
  }

  const refresh: () => void = useDebounceFn(() => {
    // Reschedules rather than skips: the point is to run *after* our writes, not
    // to drop the refresh because one happened to be open.
    if (writesInFlight > 0) {
      refresh()
      return
    }
    void load({ silent: true })
  }, SETUP_REFRESH_DEBOUNCE_MS)

  /**
   * Watches both collections, because they answer different questions.
   *
   * `projects` keeps the switcher honest when one is created or renamed
   * elsewhere. `stacks` matters for a less obvious reason: the issue list renders
   * a stack's *name* beside every row, and a rename writes only to `stacks` — no
   * event reaches `issues` at all, so without this every row would keep showing
   * the old name until a full page load.
   */
  const subscriptions: Unsubscribe[] = []
  let disposed = false

  async function connect() {
    let opened: Unsubscribe[]
    try {
      opened = await Promise.all([projectRepo.subscribe(refresh), stackRepo.subscribe(refresh)])
    } catch {
      // Nothing to tell the reader. These lists only go stale if somebody edits
      // them in another tab, and every action on this page still re-reads what
      // it changes — losing the stream costs a convenience, not correctness.
      return
    }

    // Unmounted while those calls were in flight. Closing them here rather than
    // pushing onto a list nothing will drain again is the difference between a
    // tidy teardown and two subscriptions the server keeps feeding forever.
    if (disposed) {
      for (const unsubscribe of opened) unsubscribe()
      return
    }

    subscriptions.push(...opened)
  }

  void connect()

  onScopeDispose(() => {
    disposed = true
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe()
  })

  async function openProject(projectId: string) {
    if (currentProjectId.value === projectId) return
    currentProjectId.value = projectId
    stacks.value = []
    await loadStacks(projectId)
  }

  async function createProject(name: string): Promise<Project> {
    // 90d rather than forever: an error logger that never deletes anything
    // fills a self-hosted disk silently, and the default is what most projects
    // will keep.
    const project = await tracked(projectRepo.create({ name, retention: '90d' }))
    projects.value = [...projects.value, project]
    currentProjectId.value = project.id
    stacks.value = []
    return project
  }

  async function renameProject(name: string) {
    const project = currentProject.value
    if (!project) return
    // Optimistic: this is bound to an input's every keystroke, and waiting for
    // a round trip per character would make the field feel broken.
    patchProject(project.id, { name })
    await tracked(projectRepo.update(project.id, { name }))
  }

  async function setRetention(retention: Retention) {
    const project = currentProject.value
    if (!project) return
    patchProject(project.id, { retention })
    await tracked(projectRepo.update(project.id, { retention }))
  }

  function patchProject(id: string, patch: Partial<Project>) {
    projects.value = projects.value.map((p) => (p.id === id ? { ...p, ...patch } : p))
  }

  /**
   * Deletes the open project.
   *
   * Refuses to delete the last one: an account with no projects has nowhere to
   * land, and the empty state that would need is a worse answer than "you can't
   * delete this one".
   */
  async function deleteCurrentProject() {
    const project = currentProject.value
    if (!project || projects.value.length <= 1) return

    await tracked(projectRepo.remove(project.id))
    projects.value = projects.value.filter((p) => p.id !== project.id)
    currentProjectId.value = projects.value[0]?.id ?? null
    stacks.value = currentProjectId.value
      ? await stackRepo.listForProject(currentProjectId.value)
      : []
  }

  const canDeleteProject = computed(() => projects.value.length > 1)

  async function createStack(name: string, platform = 'custom') {
    const projectId = currentProjectId.value
    if (!projectId) return
    const draft: StackDraft = { projectId, name, platform }
    stacks.value = [...stacks.value, await tracked(stackRepo.create(draft))]
  }

  async function updateStack(id: string, patch: Partial<Pick<Stack, 'name' | 'platform'>>) {
    stacks.value = stacks.value.map((s) => (s.id === id ? { ...s, ...patch } : s))
    await tracked(stackRepo.update(id, patch))
  }

  async function removeStack(id: string) {
    await tracked(stackRepo.remove(id))
    stacks.value = stacks.value.filter((s) => s.id !== id)
  }

  return {
    projects,
    stacks: currentStacks,
    currentProject,
    currentProjectId,
    loading,
    loadError,
    canDeleteProject,
    stackName,
    load,
    openProject,
    createProject,
    renameProject,
    setRetention,
    deleteCurrentProject,
    createStack,
    updateStack,
    removeStack,
  }
}
