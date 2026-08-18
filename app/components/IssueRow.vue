<script setup lang="ts">
import { formatAge } from '#shared/domain/relativeTime'
import type { Issue, IssueLevel } from '#shared/domain/types'

/**
 * One row of the list, and nothing more.
 *
 * A link rather than a button, so middle-click and cmd-click open an issue in a new
 * tab like anything else on the web. Nothing destructive is reachable from the list,
 * which is what lets it update live: a row shifting under the cursor costs a wrong
 * navigation rather than a wrong deletion.
 */
const props = defineProps<{
  issue: Issue
  stackName: string
  now: number
}>()

const LEVEL_COLOURS: Record<IssueLevel, string> = {
  error: 'bg-level-error',
  warning: 'bg-level-warning',
  info: 'bg-level-info',
}

// Anything not `unresolved` is visually retired: the dot loses its severity
// colour and the title dims. The list's job is to show what still needs doing,
// and a resolved row that looks identical to an open one defeats that.
const retired = computed(() => props.issue.status !== 'unresolved')

const dotClass = computed(() => (retired.value ? 'bg-[#333333]' : LEVEL_COLOURS[props.issue.level]))
</script>

<template>
  <div class="border-b border-rule">
    <NuxtLink
      :to="`/issues/${props.issue.id}`"
      class="flex w-full items-baseline gap-[14px] px-1 py-[14px] text-left no-underline hover:bg-hover-row"
    >
      <span class="size-[7px] shrink-0 self-center rounded-full" :class="dotClass" />

      <span
        class="text-meta w-[70px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-ink-dim"
      >
        {{ props.stackName }}
      </span>

      <span
        class="text-body min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
        :class="[
          retired ? 'text-ink-muted' : 'text-ink',
          props.issue.status === 'ignored' ? 'line-through' : '',
        ]"
      >
        {{ props.issue.title }}
      </span>

      <span class="text-meta shrink-0 text-ink-dim">×{{ props.issue.count.toLocaleString() }}</span>
      <span class="text-meta w-16 shrink-0 text-right text-ink-dim">
        {{ formatAge(props.issue.lastSeen, props.now) }}
      </span>
    </NuxtLink>
  </div>
</template>
