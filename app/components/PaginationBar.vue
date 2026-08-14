<script setup lang="ts">
const props = defineProps<{
  page: number
  totalPages: number
  label: string
  hasPrevious: boolean
  hasNext: boolean
}>()

const emit = defineEmits<{ go: [page: number] }>()
</script>

<template>
  <div class="text-meta mt-4 flex items-baseline justify-between">
    <!--
      Disabled rather than hidden: the controls keep their positions, so the
      reader's pointer stays where it was between pages.
    -->
    <button
      type="button"
      :disabled="!props.hasPrevious"
      class="action"
      :class="props.hasPrevious ? 'text-ink-muted hover:text-ink' : 'text-ink-disabled'"
      @click="emit('go', props.page - 1)"
    >
      ← prev
    </button>

    <span class="text-ink-dim">{{ props.label }}</span>

    <button
      type="button"
      :disabled="!props.hasNext"
      class="action"
      :class="props.hasNext ? 'text-ink-muted hover:text-ink' : 'text-ink-disabled'"
      @click="emit('go', props.page + 1)"
    >
      next →
    </button>
  </div>
</template>
