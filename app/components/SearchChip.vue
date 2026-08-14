<script setup lang="ts">
import { X } from 'lucide-vue-next'

/**
 * One settled filter in the search box.
 *
 * Square, not round, and that is the one place this deviates from what a "pill" usually
 * means: the design has no border radius anywhere — the 7px level dot is the sole
 * exception, and the reason it lives in its own component is to keep it that way. A
 * hairline box on `raised` is how this app already draws a contained thing, so that is
 * what a chip is here.
 *
 * The key stays dimmer than the value because the value is the part being read: at a
 * glance the box should say `unresolved`, `debug`, `v2.4` — the key is there to say what
 * dimension that is, not to be scanned.
 */
const props = defineProps<{ tagKey: string; value: string }>()

const emit = defineEmits<{ remove: [] }>()
</script>

<template>
  <span
    class="text-meta flex shrink-0 items-center gap-[6px] border border-rule bg-raised py-[2px] pr-[4px] pl-[6px]"
  >
    <span class="text-ink-dim">{{ props.tagKey }}:</span>
    <span class="text-accent">{{ props.value }}</span>
    <button
      type="button"
      class="action text-ink-dim hover:text-level-error"
      :aria-label="`remove ${props.tagKey} filter`"
      @click="emit('remove')"
    >
      <X :size="12" :stroke-width="2" />
    </button>
  </span>
</template>
