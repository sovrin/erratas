<script setup lang="ts">
import { errorMessage } from '#nexitas/app/lib/format'
import type { Issue } from '../../../shared/contracts'
import {
  SEARCH_KEYS,
  formatAge,
  formatAgeAgo,
  paginate,
  parseSearchQuery,
  selectIssues,
  setSearchToken,
  summarise,
} from '../../../shared/issues'
import { levelTones } from '../../lib/issues'

// Every issue in every project, newest first. The search is the only filter: `status:unresolved
// project:sonotas` narrows, anything else is text. It lives in the address, so links from a
// project or an issue arrive narrowed and the back button keeps it.
const route = useRoute()
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const requestedPage = computed(() => Number(route.query.page) || 1)
useHead({ title: `Errors · ${useRuntimeConfig().public.nexitas.name}` })
const { data: issues, error, refresh } = await useFetch<Issue[]>('/api/errors')
useLive(refresh)

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
    path: '/errors',
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
    <h1 class="sr-only">Errors</h1>
    <div v-if="error" class="alert" data-tone="danger" role="alert">
      <div><strong>Could not load the issues.</strong> {{ errorMessage(error) }}</div>
      <button type="button" class="btn" data-size="s" @click="refresh()">Try again</button>
    </div>
    <template v-else-if="issues">
      <!-- The baseline, whatever the search: is anything happening? -->
      <p class="cluster gap-3 text-s text-muted">
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

      <form role="search" class="field" @submit.prevent="search">
        <input
          v-model="searchText"
          class="input font-mono text-s"
          data-size="s"
          type="search"
          maxlength="200"
          placeholder="Search"
          aria-label="Search issues"
          aria-describedby="search-keys"
          @search="search"
        />
        <small id="search-keys" class="text-xs text-muted"
          >Words match the title and culprit; narrow with
          <span class="font-mono">{{ SEARCH_KEYS.map((key) => `${key}:`).join(' ') }}</span></small
        >
      </form>

      <TransitionGroup
        v-if="page.items.length"
        :key="`${q}|${page.page}`"
        tag="ul"
        name="row"
        class="relative"
        data-variant="plain"
        aria-label="Issues"
      >
        <li v-for="issue in page.items" :key="issue.id" class="py-3 hairline-b">
          <div class="cluster gap-3 flex-nowrap">
            <!-- Resolved and ignored recede: the list shows what still needs doing. -->
            <span
              class="dot"
              :data-tone="issue.status === 'unresolved' ? levelTones[issue.level] : undefined"
              aria-hidden="true"
            ></span>
            <NuxtLink
              :to="`/errors/${issue.id}`"
              class="link flex-1 min-w-0 truncate"
              :class="issue.status === 'unresolved' ? 'weight-600' : 'text-muted'"
              data-quiet
              >{{ issue.title }}</NuxtLink
            >
            <span class="sr-only">{{ issue.level }}, {{ issue.status }}</span>
            <span class="text-s text-muted tabular"
              >×{{ issue.count.toLocaleString('en-GB') }}</span
            >
            <time class="text-s text-muted tabular">{{ formatAge(issue.lastSeen, now) }}</time>
          </div>
          <p class="ps-4 font-mono text-xs text-muted truncate">
            {{ issue.projectId }} · {{ issue.stackName
            }}{{ issue.status === 'unresolved' ? '' : ` · ${issue.status}` }}
          </p>
        </li>
      </TransitionGroup>
      <p v-else class="text-muted">
        {{
          q
            ? `Nothing matches “${q}”.`
            : 'Nothing reported yet. Add a stack on a project’s page, under Errors, and send it a test event.'
        }}
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
