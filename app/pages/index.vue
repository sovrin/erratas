<script setup lang="ts">
import { SlidersHorizontal } from 'lucide-vue-next'

/**
 * The board.
 *
 * This page composes and routes events; it holds no filtering logic of its own.
 * What to show lives in `useIssueBoard` (and, under that, in the pure functions
 * in `shared/issues`), and what exists lives in `useWorkspace`.
 */
const { user, signOut } = useAuth()
const workspace = useWorkspace()
const board = useIssueBoard(workspace.currentProjectId, workspace.stackName)
const { dsnFor } = useDsn()
const now = useClock()

const showSetup = ref(false)

const summary = computed(() => board.summary(workspace.stacks.value.length))

const summaryLine = computed(() => {
  const { stacks, unresolved, events, users } = summary.value
  return [
    `${stacks} ${stacks === 1 ? 'stack' : 'stacks'}`,
    `${unresolved} unresolved`,
    `${events.toLocaleString()} events`,
    `${users.toLocaleString()} users affected`,
  ].join(' · ')
})

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

      <div class="flex items-baseline gap-5">
        <ProjectSwitcher
          :projects="workspace.projects.value"
          :current="workspace.currentProject.value"
          @open="workspace.openProject"
          @create="workspace.createProject"
        />

        <button
          type="button"
          class="text-body flex cursor-pointer items-center gap-[5px] border-none bg-transparent p-0 font-[inherit] hover:text-ink"
          :class="showSetup ? 'text-accent' : 'text-ink-muted'"
          @click="showSetup = !showSetup"
        >
          <SlidersHorizontal :size="13" :stroke-width="2" />
          setup
        </button>
      </div>
    </div>

    <div class="text-row mt-[10px] text-ink-dim">{{ summaryLine }}</div>

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

    <IssueSearchBar v-model="board.search.value" />

    <IssueFilters
      v-model:status="board.status.value"
      v-model:stack-id="board.stackId.value"
      v-model:environment="board.environment.value"
      :counts="board.selection.value.counts"
      :stacks="workspace.stacks.value"
      :environments="board.environments.value"
    />

    <div class="mt-4 border-t border-rule">
      <IssueLiveNotice
        :pending="board.pendingCount.value"
        :live="board.live.value"
        @apply="board.applyPending"
      />

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
          :expanded="board.expandedId.value === issue.id"
          :now="now"
          @toggle="board.toggleExpanded(issue.id)"
          @set-status="board.setStatus(issue.id, $event)"
          @remove="board.remove(issue.id)"
          @narrow="board.narrowBy"
        />
      </TransitionGroup>

      <div
        v-if="board.currentPage.value.items.length === 0"
        class="text-row border-b border-rule px-1 py-12 text-ink-dim"
      >
        {{ board.loading.value ? 'loading…' : 'nothing here.' }}
      </div>
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
