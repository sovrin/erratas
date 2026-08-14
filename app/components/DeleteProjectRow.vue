<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'

const props = defineProps<{ canDelete: boolean }>()

const emit = defineEmits<{ confirm: [] }>()

// Click once to arm, again to confirm. See useArmedAction for why this rather
// than a confirm() dialog or a modal.
const { armed, trigger } = useArmedAction(() => emit('confirm'))
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-5 py-[18px]"
  >
    <!--
      The consequence, not a sentence about it. The armed state spells out what the
      next click does, which is where a warning is actually read.
    -->
    <span class="text-note text-ink-faint">removes all stacks and issues</span>

    <button
      type="button"
      :disabled="!props.canDelete"
      class="action text-row shrink-0"
      :class="
        props.canDelete
          ? ['text-level-error', armed ? 'border-b border-level-error' : '']
          : 'cursor-default text-ink-faint'
      "
      @click="trigger"
    >
      <Trash2 :size="13" :stroke-width="2" />
      {{ armed ? 'click again to confirm' : 'delete project' }}
    </button>
  </div>
</template>
