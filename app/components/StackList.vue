<script setup lang="ts">
import { Check, Copy, Plus, Trash2 } from 'lucide-vue-next'

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
    <div class="mb-4 flex items-baseline gap-[10px]">
      <span class="text-label tracking-[0.1em] text-ink-dim uppercase">stacks</span>
      <span class="text-note text-ink-faint">one per runtime — each gets its own dsn</span>
    </div>

    <div v-for="stack in props.stacks" :key="stack.id" class="mb-[10px] flex items-center gap-3">
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

      <span class="text-meta flex-1 overflow-x-auto whitespace-nowrap text-ink-muted">
        {{ props.dsnFor(stack) }}
      </span>

      <button
        type="button"
        :aria-label="`copy dsn for ${stack.name}`"
        class="flex shrink-0 cursor-pointer items-center border-none bg-transparent p-0 hover:text-ink"
        :class="isCopied(stack.id) ? 'text-accent' : 'text-ink-dim'"
        @click="copy(stack.id, props.dsnFor(stack))"
      >
        <Check v-if="isCopied(stack.id)" :size="14" :stroke-width="2" />
        <Copy v-else :size="14" :stroke-width="2" />
      </button>

      <button
        type="button"
        :aria-label="`remove ${stack.name}`"
        class="flex shrink-0 cursor-pointer items-center border-none bg-transparent p-0 text-ink-faint hover:text-level-error"
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
      class="text-meta flex cursor-pointer items-center gap-[6px] border-none bg-transparent p-0 font-[inherit] text-ink-dim hover:text-accent"
      @click="creating = true"
    >
      <Plus :size="13" :stroke-width="2" />
      add stack
    </button>
  </div>
</template>
