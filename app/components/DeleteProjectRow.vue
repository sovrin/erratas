<script setup lang="ts">
const props = defineProps<{ canDelete: boolean }>()

const emit = defineEmits<{ confirm: [] }>()

// Click once to arm, again to confirm. See useArmedAction for why this rather
// than a confirm() dialog or a modal.
const { armed, trigger } = useArmedAction(() => emit('confirm'))
</script>

<template>
  <div class="flex items-center justify-between gap-3 border-t border-rule px-5 py-[18px]">
    <span class="text-note text-ink-faint">
      deleting removes the project, its stacks and all issues
    </span>

    <button
      type="button"
      :disabled="!props.canDelete"
      class="text-row shrink-0 border-none bg-transparent p-0 font-[inherit]"
      :class="
        props.canDelete
          ? ['cursor-pointer text-level-error', armed ? 'border-b border-level-error' : '']
          : 'cursor-default text-ink-faint'
      "
      @click="trigger"
    >
      {{ armed ? 'click again to confirm' : 'delete project' }}
    </button>
  </div>
</template>
