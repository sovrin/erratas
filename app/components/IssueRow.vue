<script setup lang="ts">
import { formatAge } from '#shared/domain/relativeTime'
import type { Issue, IssueLevel, IssueStatus } from '#shared/domain/types'

const props = defineProps<{
  issue: Issue
  stackName: string
  expanded: boolean
  now: number
}>()

const emit = defineEmits<{
  toggle: []
  setStatus: [status: IssueStatus]
  remove: []
  narrow: [key: string, value: string]
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
    <button
      type="button"
      :aria-expanded="expanded"
      class="flex w-full cursor-pointer items-baseline gap-[14px] border-none bg-transparent px-1 py-[14px] text-left font-[inherit] hover:bg-hover-row"
      @click="emit('toggle')"
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
    </button>

    <!--
      Three elements, and the bare middle one is load-bearing — see `.reveal` in
      main.css. `reveal` animates the panel's real height (a stack trace has no
      predictable one, which rules out `max-height`) by interpolating the grid's
      `grid-template-rows`; the middle div is what gets clipped on the way, and any
      padding on it would become a floor the panel snaps across instead of animating
      to. So the padding lives one level deeper.
    -->
    <Transition name="reveal">
      <div v-if="expanded" class="reveal">
        <div>
          <div class="pt-[6px] pr-1 pb-[26px] pl-[30px]">
            <IssueTagGrid
              :issue="props.issue"
              :stack-name="props.stackName"
              :now="props.now"
              @narrow="(key, value) => emit('narrow', key, value)"
            />
            <StackTrace :frames="props.issue.frames" />
            <IssueActions
              :status="props.issue.status"
              @set-status="emit('setStatus', $event)"
              @remove="emit('remove')"
            />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
