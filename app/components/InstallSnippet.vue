<script setup lang="ts">
import { Terminal } from 'lucide-vue-next'

import type { Stack } from '#shared/domain/types'
import { snippetFor } from '#shared/setup/installSnippets'

const props = defineProps<{ stacks: Stack[]; dsnFor: (stack: Stack) => string }>()

// Which stack's snippet is shown. Null means "the first one", so the panel is
// useful before the reader has picked anything — and stays correct if that
// stack is later removed.
const selectedId = ref<string | null>(null)

const selected = computed(
  () => props.stacks.find((stack) => stack.id === selectedId.value) ?? props.stacks[0] ?? null,
)

const snippet = computed(() =>
  selected.value ? snippetFor(selected.value.platform, props.dsnFor(selected.value)) : '',
)
</script>

<template>
  <div class="border-t border-rule px-5 py-[18px]">
    <div class="eyebrow mb-[14px]">
      <Terminal :size="13" :stroke-width="2" />
      install
    </div>

    <!-- One stack needs no tabs; the single label would just be noise. -->
    <div v-if="props.stacks.length > 1" class="mb-3 flex gap-[14px]">
      <TabButton
        v-for="stack in props.stacks"
        :key="stack.id"
        :label="stack.name"
        :active="selected?.id === stack.id"
        size="meta"
        @click="selectedId = stack.id"
      />
    </div>

    <pre
      v-if="selected"
      class="text-meta m-0 overflow-x-auto bg-raised p-[14px] leading-[1.7] font-[inherit] text-ink-muted"
      >{{ snippet }}</pre>
    <div v-else class="text-meta text-ink-dim">add a stack to get a dsn</div>
  </div>
</template>
