<script setup lang="ts">
import { ArrowLeft, Check, Link2 } from 'lucide-vue-next'

import { formatAge } from '#shared/domain/relativeTime'
import type { IssueLevel } from '#shared/domain/types'

/**
 * One issue, at its own URL.
 *
 * The reason this exists rather than an expanding row: an issue is the thing
 * people talk to each other about, and a conversation needs something to paste.
 * A row that opens in place has no address.
 *
 * Composition and routing only, like the board — every rule it needs lives in
 * `useIssue` or in the pure helpers, and every piece of the panel is a component
 * the board already used.
 */
const route = useRoute()
const router = useRouter()
const { user, signOut } = useAuth()
const workspace = useWorkspace()
const now = useClock()
const { copy, isCopied } = useCopyToClipboard()

const id = computed(() => String(route.params.id ?? ''))
const { issue, loading, notFound, actionError, setStatus, remove } = useIssue(id)

// Loaded so the stack's *name* can be shown beside the issue, and so going back
// lands on a populated list rather than an empty one. A shared link is a cold
// load: nothing has fetched the workspace yet.
onMounted(() => {
  void workspace.load()
})

/**
 * A link may point into a project other than the one that happens to be open.
 *
 * Switching to it is what makes the stack name resolve and what makes "back to
 * issues" show the list this issue is actually in — otherwise a shared link
 * quietly shows the right issue in the wrong context.
 */
watch(issue, (current) => {
  if (!current) return
  if (workspace.currentProjectId.value !== current.projectId) {
    void workspace.openProject(current.projectId)
  }
})

const LEVEL_COLOURS: Record<IssueLevel, string> = {
  error: 'bg-level-error',
  warning: 'bg-level-warning',
  info: 'bg-level-info',
}

const retired = computed(() => issue.value !== null && issue.value.status !== 'unresolved')

const dotClass = computed(() =>
  !issue.value || retired.value ? 'bg-[#333333]' : LEVEL_COLOURS[issue.value.level],
)

// Deleting is one click away from destroying somebody's only record of a bug, and
// unlike resolving it cannot be undone — so it arms first, the same way deleting
// a project does.
const { armed, trigger: confirmRemove } = useArmedAction(async () => {
  if (await remove()) await router.push('/')
})

function copyLink() {
  copy('permalink', window.location.href)
}

async function handleSignOut() {
  signOut()
  await navigateTo('/login')
}

const stackName = computed(() => (issue.value ? workspace.stackName(issue.value.stackId) : ''))
</script>

<template>
  <div class="box-border flex min-h-dvh w-full max-w-[720px] flex-col px-6 pt-14 pb-20">
    <div class="flex items-baseline justify-between gap-4">
      <NuxtLink
        to="/"
        class="text-body flex items-center gap-[6px] text-ink-muted no-underline hover:text-ink"
      >
        <ArrowLeft :size="13" :stroke-width="2" />
        issues
      </NuxtLink>

      <button
        v-if="issue"
        type="button"
        class="text-body flex cursor-pointer items-center gap-[5px] border-none bg-transparent p-0 font-[inherit]"
        :class="isCopied('permalink') ? 'text-accent' : 'text-ink-muted hover:text-ink'"
        @click="copyLink"
      >
        <component :is="isCopied('permalink') ? Check : Link2" :size="13" :stroke-width="2" />
        {{ isCopied('permalink') ? 'copied' : 'copy link' }}
      </button>
    </div>

    <div v-if="loading" class="text-row mt-12 text-ink-dim">loading…</div>

    <!--
      Deleted, or somebody else's — deliberately the same message. Which of the
      two it is would tell an unauthorised reader that the id exists.
    -->
    <div v-else-if="notFound" class="mt-12">
      <div class="text-body text-ink">no such issue.</div>
      <div class="text-row mt-2 text-ink-dim">
        It may have been deleted, or it belongs to another account.
      </div>
    </div>

    <template v-else-if="issue">
      <div class="mt-9 flex items-baseline gap-[14px]">
        <span class="size-[7px] shrink-0 self-center rounded-full" :class="dotClass" />
        <h1
          class="text-brand m-0 font-semibold"
          :class="[
            retired ? 'text-ink-muted' : 'text-ink',
            issue.status === 'ignored' ? 'line-through' : '',
          ]"
        >
          {{ issue.title }}
        </h1>
      </div>

      <div class="text-row mt-[10px] text-ink-dim">
        {{ stackName }} · {{ issue.count.toLocaleString() }}
        {{ issue.count === 1 ? 'event' : 'events' }} · last seen
        {{ formatAge(issue.lastSeen, now) }}
      </div>

      <div v-if="actionError" class="text-row mt-4 text-level-error">{{ actionError }}</div>

      <div class="mt-8">
        <!--
          `narrow` searches the list, so it has to go back there to mean anything.
          Passing the token through the URL keeps this page from having to hold a
          search box it would never use.
        -->
        <IssueTagGrid
          :issue="issue"
          :stack-name="stackName"
          :now="now"
          @narrow="(key, value) => router.push({ path: '/', query: { q: `${key}:${value}` } })"
        />
        <StackTrace :frames="issue.frames" />
        <IssueActions
          :status="issue.status"
          :remove-armed="armed"
          @set-status="setStatus"
          @remove="confirmRemove"
        />
      </div>
    </template>

    <AppFooter :email="user?.email ?? ''" @sign-out="handleSignOut" />
  </div>
</template>
