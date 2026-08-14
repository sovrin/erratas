<script setup lang="ts">
import { ISSUE_STATUSES } from '#shared/domain/types'
import type { Stack } from '#shared/domain/types'
import type { StatusCounts, StatusSelection } from '#shared/issues/issueQuery'

const props = defineProps<{
  counts: StatusCounts
  stacks: Stack[]
  environments: string[]
}>()

const status = defineModel<StatusSelection>('status', { required: true })
const stackId = defineModel<string>('stackId', { required: true })
const environment = defineModel<string>('environment', { required: true })

// `all` last, matching the design: the tabs read as a triage order —
// unresolved first because that is what the page is for.
const statusTabs = computed(() =>
  [...ISSUE_STATUSES, 'all' as const].map((key) => ({
    key,
    label: `${key} ${props.counts[key]}`,
  })),
)
</script>

<template>
  <div class="text-meta mt-[14px] flex flex-wrap items-baseline gap-2">
    <TabButton
      v-for="tab in statusTabs"
      :key="tab.key"
      :label="tab.label"
      :active="status === tab.key"
      @click="status = tab.key"
    />

    <!--
      Stack and environment sit behind their own labels rather than being merged
      into one row of tabs: they are different questions, and unlabelled tabs
      reading "all · frontend · backend · all · production" would be unreadable.
    -->
    <span class="ml-3 text-ink-faint">stack</span>
    <TabButton
      label="all"
      :active="stackId === 'all'"
      variant="plain"
      size="meta"
      @click="stackId = 'all'"
    />
    <TabButton
      v-for="stack in props.stacks"
      :key="stack.id"
      :label="stack.name"
      :active="stackId === stack.id"
      variant="plain"
      size="meta"
      @click="stackId = stack.id"
    />

    <span class="ml-3 text-ink-faint">env</span>
    <TabButton
      label="all"
      :active="environment === 'all'"
      variant="plain"
      size="meta"
      @click="environment = 'all'"
    />
    <TabButton
      v-for="env in props.environments"
      :key="env"
      :label="env"
      :active="environment === env"
      variant="plain"
      size="meta"
      @click="environment = env"
    />
  </div>
</template>
