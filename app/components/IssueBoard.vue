<script setup lang="ts">
import { formatAge, formatCount, plural } from '#nexitas/app/lib/format'
import type { IssuesPage, Stack } from '../../shared/contracts'
import { ISSUES_PER_PAGE, SEARCH_KEYS, parseSearchQuery } from '../../shared/issues'
import { issuesKey, levelTones } from '../lib/issues'

/** <IssueBoard :selected="id"><template #aside>…</template></IssueBoard>
 *  The project's issues, as the list page and an issue's page both show them: the issue's page is
 *  this list with the issue in the inspector, so going through them never leaves the list. */
const props = defineProps<{
  selected?: string
  /** The open issue's title, which heads the inspector. */
  asideName?: string
}>()
const slots = defineSlots<{ aside?: () => unknown; danger?: () => unknown }>()

// A page of the project's issues, newest first. The status links pick which ones (unresolved unless
// told), the search narrows them: `env:production` narrows a dimension, anything else is text. Both
// live in the address, so links from a project or an issue arrive narrowed and the back button
// keeps it. The API applies them, a page at a time.
const project = useProject().id.value
const route = useRoute()
const STATUSES = ['unresolved', 'resolved', 'ignored'] as const
const status = computed(() =>
  typeof route.query.status === 'string' ? route.query.status.toLowerCase() : 'unresolved',
)
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const requestedPage = computed(() => Number(route.query.page) || 1)
// Both at once: the page waits for one round trip, not two.
const [
  { data: issues, error, refresh },
  // Without a stack nothing can report: the page sets one up instead of showing the list.
  { data: stacks, refresh: refreshStacks },
] = await Promise.all([
  useProjectFetch<IssuesPage>('/errors', {
    key: issuesKey(project),
    query: { status, q, page: requestedPage, keep: computed(() => props.selected) },
  }),
  useProjectFetch<Stack[]>('/errors/stacks', { key: `erratas-stacks-${project}` }),
])

// Ages on screen move on their own while the page sits open.
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => (tick = setInterval(() => (now.value = Date.now()), 30_000)))
onUnmounted(() => clearInterval(tick))
watch(issues, () => (now.value = Date.now()))

const summary = computed(() => issues.value?.summary)

// The setup opens beside the list, never beside an issue: an issue's page shows the issue.
const setup = useSetup()
const setupOpen = computed(() => setup.open.value && !slots.aside)
// The list's own address, without the setup: an issue opened from it, or closed, keeps the
// search and page but not the setup.
const listQuery = computed(() => {
  const { setup: _, ...query } = route.query
  return query
})

/** The address for a status, search or page; anything new starts on the first page. */
function board(next: { status?: string; q?: string; page?: number }) {
  const to = { status: status.value, q: q.value, page: 1, ...next }
  return {
    path: `/p/${project}/errors`,
    query: {
      ...(to.status !== 'unresolved' ? { status: to.status } : {}),
      ...(to.q ? { q: to.q } : {}),
      ...(to.page > 1 ? { page: String(to.page) } : {}),
    },
  }
}

// The field follows the address, and searches on Enter or clear.
const searchText = ref(q.value)
watch(q, (value) => (searchText.value = value))
const search = () => navigateTo(board({ q: searchText.value.trim() }))
const searchKeys = SEARCH_KEYS.filter((key) => key !== 'status')
  .map((key) => `${key}:`)
  .join(' ')
// What a search found nothing for, in the words typed: its dimensions are not words.
const words = computed(() =>
  q.value
    .split(/\s+/)
    .filter((token) => parseSearchQuery(token).terms.length)
    .join(' '),
)

const statusLinks = computed(() => [
  ...STATUSES.map((value) => ({
    label: `${value[0]!.toUpperCase()}${value.slice(1)} ${formatCount(summary.value?.[value] ?? 0)}`,
    to: board({ status: value }),
    current: status.value === value,
  })),
  { label: 'All', to: board({ status: 'all' }), current: status.value === 'all' },
])
</script>

<template>
  <AppPage
    title="Errors"
    :aside-title="slots.aside ? 'Issue' : 'Setup'"
    :aside-name="asideName"
    :aside-close="
      slots.aside
        ? { path: `/p/${project}/errors`, query: listQuery }
        : setupOpen
          ? setup.close.value
          : undefined
    "
    failed="Could not load the issues."
    :error="error"
    :retry="refresh"
  >
    <template v-if="stacks?.length && !selected" #actions><SetupLink /></template>
    <template v-if="summary && stacks?.length" #lead>
      <!-- The baseline, whatever the search: is anything happening? Not before anything can
           report, where the page sets up a stack instead. -->
      <AppLead
        :title="
          summary.unresolved ? plural(summary.unresolved, 'unresolved issue') : 'Nothing unresolved'
        "
      >
        <template #meta>
          <template v-if="summary.lastEventAt === null">Nothing reported yet.</template>
          <template v-else>
            <span class="tabular">{{ formatCount(summary.newIn24h) }} new in 24h</span> ·
            <span class="tabular">{{ plural(summary.events, 'event') }}</span> · last event
            {{ formatAge(summary.lastEventAt, now) }}
          </template>
        </template>
      </AppLead>
    </template>
    <template v-if="stacks?.length" #filters>
      <FilterLinks label="Show" :options="statusLinks" />
      <SearchBox
        v-model="searchText"
        label="Search issues"
        placeholder="Search"
        mono
        :maxlength="200"
        @search="search"
      >
        <template #hint
          >Words match the title and culprit; narrow with
          <span class="font-mono">{{ searchKeys }}</span></template
        >
      </SearchBox>
    </template>
    <!-- No stack, nothing can report: no list to show yet, only how to start. A stack needs a name
         and a platform, so a one-click start does not fit; its form takes the content's place. -->
    <div v-if="stacks && !stacks.length" class="stack gap-4">
      <EmptyState>
        Errors are not collected for this project yet. Add a stack for each runtime, such as the
        site and its API, to get the DSN its apps report with.
      </EmptyState>
      <StackSetup :stacks="stacks" @changed="refreshStacks" />
    </div>
    <template v-else-if="issues">
      <DataTable v-if="issues.items.length">
        <thead>
          <tr>
            <th scope="col">Issue</th>
            <th scope="col" data-num>Events</th>
            <th scope="col" data-num>Last seen</th>
          </tr>
        </thead>
        <!-- Rows animate only while the view stays the same (live arrivals); a new search or
             page replaces the list at once, keyed by the view. -->
        <TransitionGroup
          :key="`${status}|${q}|${issues.page}`"
          tag="tbody"
          name="row"
          class="relative"
        >
          <tr
            v-for="issue in issues.items"
            :key="issue.id"
            :aria-selected="issue.id === props.selected || undefined"
          >
            <td>
              <span class="stack gap-1 min-w-0">
                <!-- Resolved and ignored recede: the list shows what still needs doing. -->
                <!-- The search and page come along, so the list beside the issue stays the same. -->
                <NuxtLink
                  :to="{ path: `/p/${project}/errors/${issue.id}`, query: listQuery }"
                  class="link break-words"
                  data-quiet
                  :class="issue.status === 'unresolved' ? 'weight-600' : 'text-muted'"
                  >{{ issue.title }}</NuxtLink
                >
                <span class="cluster gap-2 text-xs text-muted">
                  <StateDot
                    :tone="issue.status === 'unresolved' ? levelTones[issue.level] : undefined"
                    >{{ issue.level }} · {{ issue.status }}</StateDot
                  >
                  <span class="font-mono break-words">{{ issue.stackName }}</span>
                </span>
              </span>
            </td>
            <td data-num>{{ formatCount(issue.count) }}</td>
            <td data-num class="text-muted">
              <time :datetime="new Date(issue.lastSeen).toISOString()">{{
                formatAge(issue.lastSeen, now)
              }}</time>
            </td>
          </tr>
        </TransitionGroup>
      </DataTable>
      <EmptyState v-else-if="issues.summary.issues">{{
        words ? `Nothing matches “${words}”.` : 'Nothing here.'
      }}</EmptyState>
      <EmptyState v-else>
        Nothing reported yet. Send a stack a test event from
        <NuxtLink :to="setup.openLink.value" class="link">its setup</NuxtLink>.
      </EmptyState>

      <PagerNav
        :page="issues.page"
        :page-size="ISSUES_PER_PAGE"
        :total="issues.total"
        :to="(next) => board({ page: next })"
      />
    </template>

    <template v-if="slots.aside" #aside><slot name="aside" /></template>
    <template v-else-if="setupOpen && stacks?.length" #aside>
      <StackSetup :stacks="stacks" @changed="refreshStacks" />
    </template>
    <template v-if="slots.danger" #danger><slot name="danger" /></template>
  </AppPage>
</template>
