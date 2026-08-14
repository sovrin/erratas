<script setup lang="ts">
import { Check, EyeOff, RotateCcw, Trash2 } from 'lucide-vue-next'

import type { IssueStatus } from '#shared/domain/types'

const props = defineProps<{ status: IssueStatus }>()

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
        class="text-row flex cursor-pointer items-center gap-[7px] border-none bg-transparent p-0 font-[inherit] text-accent hover:text-ink"
        @click="emit('setStatus', 'resolved')"
      >
        <Check :size="13" :stroke-width="2" />
        resolve
      </button>
      <button
        type="button"
        class="text-row flex cursor-pointer items-center gap-[7px] border-none bg-transparent p-0 font-[inherit] text-ink-muted hover:text-ink"
        @click="emit('setStatus', 'ignored')"
      >
        <EyeOff :size="13" :stroke-width="2" />
        ignore
      </button>
    </template>

    <button
      v-else
      type="button"
      class="text-row flex cursor-pointer items-center gap-[7px] border-none bg-transparent p-0 font-[inherit] text-accent hover:text-ink"
      @click="emit('setStatus', 'unresolved')"
    >
      <RotateCcw :size="13" :stroke-width="2" />
      reopen
    </button>

    <span class="flex-1" />

    <button
      type="button"
      class="text-row flex cursor-pointer items-center gap-[7px] border-none bg-transparent p-0 font-[inherit] text-ink-dim hover:text-level-error"
      @click="emit('remove')"
    >
      <Trash2 :size="13" :stroke-width="2" />
      delete
    </button>
  </div>
</template>
