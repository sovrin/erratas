<script setup lang="ts">
import { errorMessage } from '#nexitas/app/lib/format'
import type { Issue, Stack } from '../../../../../shared/contracts'
import {
  SEARCH_KEYS,
  formatAge,
  formatAgeAgo,
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
useHead({ title: `Errors · ${useRuntimeConfig().public.nexitas.name}` })
const { data: issues, error, refresh } = await useFetch<Issue[]>(`/api/p/${project}/errors`)
// Without a stack nothing can report, which the empty list says instead of "nothing yet".
const { data: stacks, refresh: refreshStacks } = await useFetch<Stack[]>(
  `/api/p/${project}/errors/stacks`,
  { key: `erratas-stacks-${project}` },
)
useLive(() => Promise.all([refresh(), refreshStacks()]))

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
</script>

<template>
  <div class="stack gap-5">
    <div class="page-header">
      <div class="stack gap-1">
        <h1 class="text-xl weight-600">Errors</h1>
        <!-- The baseline, whatever the search: is anything happening? -->
        <p v-if="issues" class="cluster gap-3 text-s text-muted">
          <NuxtLink
            v-if="summary.unresolved"
            :to="board({ q: setSearchToken(q, 'status', 'unresolved') })"
            class="link"
            >{{ summary.unresolved }} unresolved</NuxtLink
          >
          <span v-else>nothing unresolved</span>
          <span class="tabular">{{ summary.newIn24h }} new in 24h</span>
          <span class="tabular">{{ summary.events.toLocaleString('en-GB') }} events</span>
          <span>{{
            summary.lastEventAt === null
              ? 'nothing reported yet'
              : `last event ${formatAgeAgo(summary.lastEventAt, now)}`
          }}</span>
        </p>
      </div>
      <form role="search" @submit.prevent="search">
        <input
          v-model="searchText"
          class="input font-mono text-s"
          data-size="s"
          style="inline-size: min(100%, 20rem)"
          type="search"
          maxlength="200"
          placeholder="status:unresolved"
          aria-label="Search issues"
          aria-describedby="search-keys"
          @search="search"
        />
      </form>
    </div>
    <small id="search-keys" class="text-xs text-muted"
      >Words match the title and culprit; narrow with
      <span class="font-mono">{{ SEARCH_KEYS.map((key) => `${key}:`).join(' ') }}</span></small
    >

    <div v-if="error" class="alert" data-tone="danger" role="alert">
      <div><strong>Could not load the issues.</strong> {{ errorMessage(error) }}</div>
      <button type="button" class="btn" data-size="s" @click="refresh()">Try again</button>
    </div>
    <template v-else-if="issues">
      <div v-if="page.items.length" class="table-scroll">
        <table class="table" data-size="s">
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
                <span class="cluster gap-3 flex-nowrap items-baseline">
                  <!-- Resolved and ignored recede: the list shows what still needs doing. -->
                  <span
                    class="dot"
                    :data-tone="issue.status === 'unresolved' ? levelTones[issue.level] : undefined"
                    aria-hidden="true"
                  ></span>
                  <span class="stack gap-1 min-w-0">
                    <NuxtLink
                      :to="`/p/${project}/errors/${issue.id}`"
                      class="link break-words"
                      :class="issue.status === 'unresolved' ? 'weight-600' : 'text-muted'"
                      >{{ issue.title }}</NuxtLink
                    >
                    <span class="font-mono text-xs text-muted break-words"
                      >{{ issue.stackName
                      }}{{ issue.status === 'unresolved' ? '' : ` · ${issue.status}` }}</span
                    >
                  </span>
                  <span class="sr-only">{{ issue.level }}, {{ issue.status }}</span>
                </span>
              </td>
              <td data-num>{{ issue.count.toLocaleString('en-GB') }}</td>
              <td data-num class="text-muted">
                <time :datetime="new Date(issue.lastSeen).toISOString()">{{
                  formatAge(issue.lastSeen, now)
                }}</time>
              </td>
            </tr>
          </TransitionGroup>
        </table>
      </div>
      <p v-else-if="q" class="text-muted">Nothing matches “{{ q }}”.</p>
      <p v-else-if="stacks?.length" class="text-muted">
        Nothing reported yet. Send a stack a test event from
        <NuxtLink :to="`/p/${project}`" class="link">the project’s page</NuxtLink>.
      </p>
      <p v-else class="text-muted">
        Errors are not collected for this project yet.
        <NuxtLink :to="`/p/${project}`" class="link">Add a stack</NuxtLink> on its page to get the
        DSN its apps report with.
      </p>

      <nav v-if="page.pages > 1" class="cluster justify-between gap-4 text-s" aria-label="Pages">
        <NuxtLink v-if="page.page > 1" :to="board({ page: page.page - 1 })" class="link"
          >Newer</NuxtLink
        >
        <span v-else></span>
        <span class="text-muted tabular">{{ page.label }}</span>
        <NuxtLink v-if="page.page < page.pages" :to="board({ page: page.page + 1 })" class="link"
          >Older</NuxtLink
        >
        <span v-else></span>
      </nav>
    </template>
  </div>
</template>
