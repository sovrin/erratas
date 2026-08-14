<script setup lang="ts">
/**
 * The one place realtime is visible as a mechanism rather than as rows quietly
 * changing.
 *
 * It exists because both of its states are otherwise indistinguishable from "no
 * errors are arriving", which is the single most misleading thing this page could
 * imply. A list that has paused looks calm; a list whose stream died looks calm;
 * a genuinely quiet project looks calm. Naming the first two is what makes the
 * third trustworthy.
 *
 * Rendered as the first row of the list, sharing the row border, so it reads as
 * part of the list it is describing rather than as a banner over it.
 */
const props = defineProps<{
  /** Changes that have arrived but are being held back. */
  pending: number
  /** Whether the change stream is connected. */
  live: boolean
}>()

const emit = defineEmits<{ apply: [] }>()

const label = computed(() =>
  props.pending === 1 ? '1 update paused' : `${props.pending} updates paused`,
)
</script>

<template>
  <!--
    `out-in`, so the two states never occupy the list at once. They are mutually
    exclusive statements about the same thing and overlapping them for 120ms would
    have the list claim to be both paused and offline.
  -->
  <Transition name="fade" mode="out-in">
    <div
      v-if="props.pending > 0"
      class="text-meta flex items-baseline justify-between gap-4 border-b border-rule px-1 py-[10px] text-ink-dim"
    >
      <span>{{ label }}</span>

      <button
        type="button"
        class="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-accent hover:text-ink"
        @click="emit('apply')"
      >
        show
      </button>
    </div>

    <!--
      No action offered: the stream is opened for you and PocketBase's client
      retries it on its own, so the only honest thing to say is that the list is a
      snapshot now. A "retry" button here would imply this is the reader's problem
      to fix.
    -->
    <div v-else-if="!props.live" class="text-meta border-b border-rule px-1 py-[10px] text-ink-dim">
      live updates offline · this list is a snapshot
    </div>
  </Transition>
</template>
