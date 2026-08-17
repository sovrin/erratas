<script setup lang="ts">
/**
 * Says when the list has stopped updating itself.
 *
 * It exists because a dead stream and a genuinely quiet project look identical —
 * both are a list that does not move — and that is the single most misleading
 * thing this page could imply. Naming the first is what makes the second
 * trustworthy.
 *
 * It used to have a second state, explaining changes held back while a row was
 * expanded. That went when the detail view moved to its own route: nothing on the
 * list is destructive any more, so there is nothing to hold changes for.
 *
 * Rendered as the first row of the list, sharing the row border, so it reads as
 * part of the list it describes rather than as a banner over it.
 */
const props = defineProps<{
  /** Whether the change stream is connected. */
  live: boolean
}>()
</script>

<template>
  <!--
    No action offered: the stream is opened for you and PocketBase's client
    retries it on its own, so the only honest thing to say is that the list is a
    snapshot now. A "retry" button here would imply this is the reader's problem
    to fix.
  -->
  <Transition name="fade">
    <div v-if="!props.live" class="text-meta border-b border-rule px-1 py-[10px] text-ink-dim">
      live updates offline · this list is a snapshot
    </div>
  </Transition>
</template>
