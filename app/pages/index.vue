<script setup lang="ts">
import { SlidersHorizontal } from 'lucide-vue-next'

/**
 * The board.
 *
 * This page composes and routes events; it holds no filtering logic of its own.
 * What to show lives in `useIssueBoard` (and, under that, in the pure functions
 * in `shared/issues`), and what exists lives in `useWorkspace`.
 */
const route = useRoute()
const router = useRouter()
const { user, signOut } = useAuth()
const workspace = useWorkspace()
const board = useIssueBoard(workspace.currentProjectId, workspace.stackName)
const { dsnFor, ingestUrlFor } = useDsn()
const now = useClock()

/**
 * `?q=` narrows the list, and is then removed from the URL.
 *
 * It is how the issue page's tag grid gets back here — that page has no search
 * box, so clicking `release:v1.4.0` navigates with the token instead. Consumed
 * rather than kept in sync: leaving it in the address bar would make the URL and
 * the search box two sources of truth for one filter, and the first edit in the
 * box would make them disagree. It is an instruction on arrival, not state.
 */
watch(
  () => route.query.q,
  (q) => {
    if (typeof q !== 'string' || q === '') return
    const [key, ...rest] = q.split(':')
    if (key && rest.length > 0) board.narrowBy(key, rest.join(':'))
    void router.replace({ path: '/', query: {} })
  },
  { immediate: true },
)

const showSetup = ref(false)

/**
 * A stack that has never reported, as opposed to a filter that matched nothing.
 *
 * Keyed on the whole project having no issues rather than on the current page
 * being empty: narrowing a filter to nothing is `nothing here.`, and telling
 * somebody their SDK might be misconfigured because they typed a search term
 * would be worse than saying nothing.
 */
const waitingForFirstEvent = computed(
  () =>
    !board.loading.value && board.issues.value.length === 0 && workspace.stacks.value.length > 0,
)

const summary = computed(() => board.summary(workspace.stacks.value.length, now.value))

// Fired, not awaited. A top-level await here would make the page component
// async, which wraps it in Nuxt's <Suspense> — and <Suspense> combined with the
// out-in page transition throws `Cannot read properties of null (reading
// Symbol(_leaveCb))` out of Vue's transition internals on every navigation into
// this route, because the leaving page is torn down while its callback is still
// pending.
//
// Not awaiting is also the better shape regardless: the shell paints
// immediately and the list fills in, rather than the previous page hanging on
// screen until two requests come back. `loading` drives the empty row.
//
// Both are started together rather than in series — the issue list is the
// reason the page exists and should not queue behind the project list.
onMounted(() => {
  void Promise.all([workspace.load(), board.load()])
})

// A project with no stacks cannot receive anything, so the setup panel is the
// only useful thing on the page — open it rather than showing an empty list
// under a search box that filters nothing. Guarded on `loading` so it does not
// fire during the moment before the first response arrives, when every project
// briefly looks stackless.
watchEffect(() => {
  if (workspace.loading.value) return
  if (workspace.currentProject.value && workspace.stacks.value.length === 0) showSetup.value = true
})

async function handleSignOut() {
  signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="box-border flex min-h-dvh w-full max-w-[720px] flex-col px-6 pt-14 pb-20">
    <div class="flex items-baseline justify-between gap-4">
      <AppBrand />

      <!--
        Centred, not baselined. A flex container's baseline is synthesised from its
        first item, and an SVG has none — so `setup`, whose icon comes first, reported
        the icon's bottom edge as its baseline and rode ~3px above `home`, whose text
        comes first. Centring makes the two buttons agree; the group's own baseline
        still comes from `ProjectSwitcher`'s text, so the row below the brand is
        unchanged.
      -->
      <div class="flex items-center gap-5">
        <ProjectSwitcher
          :projects="workspace.projects.value"
          :current="workspace.currentProject.value"
          @open="workspace.openProject"
          @create="workspace.createProject"
        />

        <button
          type="button"
          class="action text-body hover:text-ink"
          :class="showSetup ? 'text-accent' : 'text-ink-muted'"
          @click="showSetup = !showSetup"
        >
          <SlidersHorizontal :size="13" :stroke-width="2" />
          setup
        </button>
      </div>
    </div>

    <ProjectStats :summary="summary" :now="now" @narrow="board.narrowBy" />

    <Transition name="fade">
      <div
        v-if="workspace.loadError.value || board.loadError.value"
        class="text-row mt-4 text-level-error"
      >
        {{ workspace.loadError.value ?? board.loadError.value }}
      </div>
    </Transition>

    <!--
      Reveal rather than fade: this panel is tall, and everything below it moves. The
      bare inner div is required — `SetupPanel`'s own root carries `mt-9` and a border,
      and styling on the clipped element becomes a floor the panel cannot animate below
      (see `.reveal` in main.css).
    -->
    <Transition name="reveal">
      <div v-if="showSetup && workspace.currentProject.value" class="reveal">
        <div>
          <SetupPanel
            :project="workspace.currentProject.value"
            :stacks="workspace.stacks.value"
            :can-delete="workspace.canDeleteProject.value"
            :dsn-for="dsnFor"
            @rename-project="workspace.renameProject"
            @retain="workspace.setRetention"
            @delete-project="workspace.deleteCurrentProject"
            @create-stack="workspace.createStack"
            @rename-stack="(id, name) => workspace.updateStack(id, { name })"
            @retarget-stack="(id, platform) => workspace.updateStack(id, { platform })"
            @remove-stack="workspace.removeStack"
          />
        </div>
      </div>
    </Transition>

    <IssueSearchBar
      v-model="board.search.value"
      :issues="board.issues.value"
      :stack-name="workspace.stackName"
      :result-count="board.resultCount.value"
    />

    <div class="mt-4 border-t border-rule">
      <IssueLiveNotice :live="board.live.value" />

      <!--
        A TransitionGroup because this list reorders on its own: realtime patches
        rows and the sort is by `lastSeen`, so rows change places without anybody
        clicking. `row-move` is what makes that legible instead of startling.
      -->
      <TransitionGroup name="row" tag="div">
        <IssueRow
          v-for="issue in board.currentPage.value.items"
          :key="issue.id"
          :issue="issue"
          :stack-name="workspace.stackName(issue.stackId)"
          :now="now"
        />
      </TransitionGroup>

      <!--
        Fades rather than snapping: the first event replaces this whole block with
        a row, and that is the one moment on this page somebody is actually waiting
        for. The stack shown is the first one — with several, the endpoint still
        belongs to a named stack, so the label says which.
      -->
      <Transition name="fade">
        <IssueListEmpty
          v-if="waitingForFirstEvent && workspace.stacks.value[0]"
          :stack="workspace.stacks.value[0]"
          :ingest-url="ingestUrlFor(workspace.stacks.value[0])"
        />
        <div
          v-else-if="board.currentPage.value.items.length === 0"
          class="text-row border-b border-rule px-1 py-12 text-ink-dim"
        >
          {{ board.loading.value ? 'loading…' : 'nothing here.' }}
        </div>
      </Transition>
    </div>

    <PaginationBar
      v-if="board.currentPage.value.hasPagination"
      :page="board.currentPage.value.page"
      :total-pages="board.currentPage.value.totalPages"
      :label="board.currentPage.value.label"
      :has-previous="board.currentPage.value.hasPrevious"
      :has-next="board.currentPage.value.hasNext"
      @go="board.goToPage"
    />

    <AppFooter :email="user?.email ?? ''" @sign-out="handleSignOut" />
  </div>
</template>
