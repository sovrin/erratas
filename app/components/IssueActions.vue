<script setup lang="ts">
import { Check, EyeOff, RotateCcw, Trash2 } from 'lucide-vue-next'

import type { IssueStatus } from '#shared/domain/types'

const props = defineProps<{
  status: IssueStatus
  /**
   * Whether delete has been clicked once already.
   *
   * The arming lives in the page, not here: this component stays presentational,
   * and the timeout that disarms it belongs with the action it guards.
   */
  removeArmed?: boolean
}>()

const emit = defineEmits<{ setStatus: [status: IssueStatus]; remove: [] }>()

// Resolve and ignore are offered only on something still open; reopen only on
// something closed. Showing all three at once would make the reader work out
// which of them is a no-op.
const isOpen = computed(() => props.status === 'unresolved')
</script>

<template>
  <div class="flex items-center gap-[22px]">
    <template v-if="isOpen">
      <button
        type="button"
        class="action text-row text-accent hover:text-ink"
        @click="emit('setStatus', 'resolved')"
      >
        <Check :size="13" :stroke-width="2" />
        resolve
      </button>
      <button
        type="button"
        class="action text-row text-ink-muted hover:text-ink"
        @click="emit('setStatus', 'ignored')"
      >
        <EyeOff :size="13" :stroke-width="2" />
        ignore
      </button>
    </template>

    <button
      v-else
      type="button"
      class="action text-row text-accent hover:text-ink"
      @click="emit('setStatus', 'unresolved')"
    >
      <RotateCcw :size="13" :stroke-width="2" />
      reopen
    </button>

    <span class="flex-1" />

    <!--
      Armed, it says what the next click will do. Deleting an issue is the only
      irreversible thing on this page — resolving can be undone by reopening —
      and it sits a few pixels from controls that cannot hurt anybody.
    -->
    <button
      type="button"
      class="action text-row"
      :class="props.removeArmed ? 'text-level-error' : 'text-ink-dim hover:text-level-error'"
      @click="emit('remove')"
    >
      <Trash2 :size="13" :stroke-width="2" />
      {{ props.removeArmed ? 'delete — click again' : 'delete' }}
    </button>
  </div>
</template>
