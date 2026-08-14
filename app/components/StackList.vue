<script setup lang="ts">
import { Check, Copy, Layers, Plus, Trash2 } from 'lucide-vue-next'

import type { Stack } from '#shared/domain/types'

/**
 * The stacks table in the setup panel.
 *
 * Name and platform are edited in place — there is no save button anywhere in
 * this design, and a stack has two fields, which is not worth a form.
 */
const props = defineProps<{ stacks: Stack[]; dsnFor: (stack: Stack) => string }>()

const emit = defineEmits<{
  rename: [id: string, name: string]
  retarget: [id: string, platform: string]
  remove: [id: string]
  create: [name: string]
}>()

const creating = ref(false)
const { copy, isCopied } = useCopyToClipboard()

function create(name: string) {
  creating.value = false
  emit('create', name)
}
</script>

<template>
  <div class="px-5 py-[18px]">
    <div class="eyebrow mb-[14px]">
      <Layers :size="13" :stroke-width="2" />
      stacks
    </div>

    <div
      v-for="stack in props.stacks"
      :key="stack.id"
      class="mb-[10px] flex flex-wrap items-center gap-3"
    >
      <input
        :value="stack.name"
        type="text"
        aria-label="stack name"
        class="field text-row w-[90px] shrink-0 py-[2px]"
        @change="emit('rename', stack.id, ($event.target as HTMLInputElement).value)"
      />
      <input
        :value="stack.platform"
        type="text"
        aria-label="platform"
        class="field text-meta w-[56px] shrink-0 py-[2px] text-ink-dim"
        @change="emit('retarget', stack.id, ($event.target as HTMLInputElement).value)"
      />

      <!--
        An explicit floor rather than `min-w-0`, because `whitespace-nowrap` makes this
        item's automatic minimum the entire DSN — which is what made the row unable to
        shrink at all. 200px is the width below which the address stops being worth
        reading; the row wraps and hands it a line of its own instead, where
        `overflow-x-auto` scrolls the rest.
      -->
      <span class="text-meta min-w-[200px] flex-1 overflow-x-auto whitespace-nowrap text-ink-muted">
        {{ props.dsnFor(stack) }}
      </span>

      <button
        type="button"
        :aria-label="`copy dsn for ${stack.name}`"
        class="action shrink-0 hover:text-ink"
        :class="isCopied(stack.id) ? 'text-accent' : 'text-ink-dim'"
        @click="copy(stack.id, props.dsnFor(stack))"
      >
        <Check v-if="isCopied(stack.id)" :size="14" :stroke-width="2" />
        <Copy v-else :size="14" :stroke-width="2" />
      </button>

      <button
        type="button"
        :aria-label="`remove ${stack.name}`"
        class="action shrink-0 text-ink-faint hover:text-level-error"
        @click="emit('remove', stack.id)"
      >
        <Trash2 :size="14" :stroke-width="2" />
      </button>
    </div>

    <InlineCreateInput
      v-if="creating"
      placeholder="stack name (e.g. backend), enter to create"
      width="280px"
      @submit="create"
      @cancel="creating = false"
    />
    <button
      v-else
      type="button"
      class="action text-meta text-ink-dim hover:text-accent"
      @click="creating = true"
    >
      <Plus :size="13" :stroke-width="2" />
      add stack
    </button>
  </div>
</template>
