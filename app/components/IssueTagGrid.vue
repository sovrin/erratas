<script setup lang="ts">
import { formatAge, formatAgeAgo } from '#shared/domain/relativeTime'
import type { Issue } from '#shared/domain/types'

/**
 * The context block: where this issue is happening, and how much.
 *
 * Two kinds of row, and the distinction carries meaning rather than styling.
 * A *clickable* row is a searchable dimension — clicking it narrows the list to
 * everything sharing that value, which is the fastest way to answer "is this
 * one release or all of them". A *plain* row is a measurement; there is nothing
 * to filter to.
 */
const props = defineProps<{ issue: Issue; stackName: string; now: number }>()

const emit = defineEmits<{ narrow: [key: string, value: string] }>()

interface TagRow {
  label: string
  value: string
  /** The search key this row filters on, or null when it is just a number. */
  key: string | null
}

const rows = computed<TagRow[]>(() => {
  const issue = props.issue

  return (
    [
      { label: 'env', value: issue.environment, key: 'env' },
      { label: 'release', value: issue.release, key: 'release' },
      { label: 'level', value: issue.level, key: 'level' },
      { label: 'stack', value: props.stackName, key: 'stack' },
      { label: 'user', value: issue.user, key: 'user' },
      { label: 'os', value: issue.os, key: 'os' },
      { label: 'browser', value: issue.browser, key: 'browser' },
      { label: 'events', value: issue.count.toLocaleString(), key: null },
      { label: 'users', value: issue.users.toLocaleString(), key: null },
      { label: 'first seen', value: formatAgeAgo(issue.firstSeen, props.now), key: null },
      { label: 'last seen', value: formatAge(issue.lastSeen, props.now), key: null },
    ] satisfies TagRow[]
  ).filter((row) => row.value !== '' && row.value !== '—')
})

// Split into two columns by filling the left one first, so the reading order is
// top-to-bottom then across — the order the rows are declared in, which is
// roughly most to least useful.
const half = computed(() => Math.ceil(rows.value.length / 2))
const columns = computed(() => [rows.value.slice(0, half.value), rows.value.slice(half.value)])
</script>

<template>
  <div class="mb-5 grid grid-cols-2 content-start gap-x-7">
    <div v-for="(column, columnIndex) in columns" :key="columnIndex">
      <div
        v-for="(row, rowIndex) in column"
        :key="row.label"
        class="flex items-baseline gap-3 px-[10px] py-[6px]"
        :class="rowIndex % 2 === 0 ? 'bg-raised' : 'bg-transparent'"
      >
        <span class="text-meta w-24 shrink-0 text-ink-dim">{{ row.label }}</span>

        <button
          v-if="row.key"
          type="button"
          class="text-meta cursor-pointer border-none bg-transparent p-0 text-left font-[inherit] text-ink-soft underline decoration-dotted underline-offset-[3px] hover:text-accent"
          @click="emit('narrow', row.key, row.value)"
        >
          {{ row.value }}
        </button>
        <span v-else class="text-meta text-ink">{{ row.value }}</span>
      </div>
    </div>
  </div>
</template>
