<script setup lang="ts">
import { formatAge, formatCount } from '#nexitas/app/lib/format'
import type { Issue, Stack } from '../../../../../shared/contracts'
import {
  ISSUES_PER_PAGE,
  SEARCH_KEYS,
  paginate,
  parseSearchQuery,
  selectIssues,
  setSearchToken,
  summarise,
} from '../../../../../shared/issues'
import { levelTones } from '../../../../lib/issues'

// The project's issues, newest first. The search is the only filter: `status:unresolved
// env:production` narrows, anything else is text. It lives in the address, so links from a
// project or an issue arrive narrowed and the back button keeps it.
const project = useProject().id.value
const route = useRoute()
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const requestedPage = computed(() => Number(route.query.page) || 1)
const { data: issues, error, refresh } = await useProjectFetch<Issue[]>('/errors')
// Without a stack nothing can report, which the empty list says instead of "nothing yet".
const { data: stacks } = await useProjectFetch<Stack[]>('/errors/stacks', {
  key: `erratas-stacks-${project}`,
})

// Ages on screen move on their own while the page sits open.
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => (tick = setInterval(() => (now.value = Date.now()), 30_000)))
onUnmounted(() => clearInterval(tick))
watch(issues, () => (now.value = Date.now()))

const summary = computed(() => summarise(issues.value ?? [], now.value))
const page = computed(() =>
  paginate(selectIssues(issues.value ?? [], parseSearchQuery(q.value)), requestedPage.value),
)

/** The address for a search or page; anything new starts on the first page. */
function board(next: { q?: string; page?: number }) {
  const query = { q: q.value, page: 1, ...next }
  return {
    path: `/p/${project}/errors`,
    query: {
      ...(query.q ? { q: query.q } : {}),
      ...(query.page > 1 ? { page: String(query.page) } : {}),
    },
  }
}

// The field follows the address, and searches on Enter or clear.
const searchText = ref(q.value)
watch(q, (value) => (searchText.value = value))
const search = () => navigateTo(board({ q: searchText.value.trim() }))
const searchKeys = SEARCH_KEYS.map((key) => `${key}:`).join(' ')
</script>

<template>
  <AppPage title="Errors" failed="Could not load the issues." :error="error" :retry="refresh">
    <!-- The baseline, whatever the search: is anything happening? -->
    <template v-if="issues" #subtitle>
      <span class="cluster gap-3">
        <NuxtLink
          v-if="summary.unresolved"
          :to="board({ q: setSearchToken(q, 'status', 'unresolved') })"
          class="link"
          >{{ summary.unresolved }} unresolved</NuxtLink
        >
        <span v-else>nothing unresolved</span>
        <span class="tabular">{{ summary.newIn24h }} new in 24h</span>
        <span class="tabular">{{ formatCount(summary.events) }} events</span>
        <span>{{
          summary.lastEventAt === null
            ? 'nothing reported yet'
            : `last event ${formatAge(summary.lastEventAt, now)}`
        }}</span>
      </span>
    </template>
    <template #actions>
      <SearchBox
        v-model="searchText"
        label="Search issues"
        placeholder="status:unresolved"
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
    <template v-if="issues">
      <DataTable v-if="page.items.length">
        <thead>
          <tr>
            <th scope="col">Issue</th>
            <th scope="col" data-num>Events</th>
            <th scope="col" data-num>Last seen</th>
          </tr>
        </thead>
        <!-- Rows animate only while the view stays the same (live arrivals); a new search or
             page replaces the list at once, keyed by the view. -->
        <TransitionGroup :key="`${q}|${page.page}`" tag="tbody" name="row" class="relative">
          <tr v-for="issue in page.items" :key="issue.id">
            <td>
              <span class="stack gap-1 min-w-0">
                <!-- Resolved and ignored recede: the list shows what still needs doing. -->
                <NuxtLink
                  :to="`/p/${project}/errors/${issue.id}`"
                  class="link break-words"
                  :class="issue.status === 'unresolved' ? 'weight-600' : 'text-muted'"
                  >{{ issue.title }}</NuxtLink
                >
                <span class="cluster gap-2 text-xs text-muted">
                  <StateDot
                    :tone="issue.status === 'unresolved' ? levelTones[issue.level] : undefined"
                    >{{ issue.level }}, {{ issue.status }}</StateDot
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
      <EmptyState v-else-if="q">Nothing matches “{{ q }}”.</EmptyState>
      <EmptyState v-else-if="stacks?.length">
        Nothing reported yet. Send a stack a test event from
        <NuxtLink :to="`/p/${project}`" class="link">the project’s page</NuxtLink>.
      </EmptyState>
      <EmptyState v-else>
        Errors are not collected for this project yet.
        <NuxtLink :to="`/p/${project}`" class="link">Add a stack</NuxtLink> on its page to get the
        DSN its apps report with.
      </EmptyState>

      <PagerNav
        :page="page.page"
        :page-size="ISSUES_PER_PAGE"
        :total="page.total"
        :to="(next) => board({ page: next })"
      />
    </template>
  </AppPage>
</template>
