<script setup lang="ts">
import { Check, Copy, Radio, Send } from 'lucide-vue-next'

import type { Stack } from '#shared/domain/types'
import { testEventCommand } from '#shared/setup/testCommand'

/**
 * A stack that has never reported.
 *
 * This is the one screen in the app whose content is an absence, and the absence
 * is ambiguous: no events means nothing has broken, *or* nothing is reporting.
 * `nothing here.` — what the list said before — is the same three words a healthy
 * quiet project shows, so it answered neither question and left somebody who had
 * just pasted a DSN with nowhere to go.
 *
 * So the screen does two things. It shows the endpoint this stack's SDK posts to,
 * which is the first thing worth checking against what the reporting app is
 * configured with. And it hands over a command that sends a real event, which is
 * what actually separates the two cases: if it lands, ingest is reachable and the
 * problem is in the app; if it does not, the problem is before erratas.
 *
 * Presentational, like everything else here — it is given a stack and the URL, and
 * asks nothing of a repository.
 */
const props = defineProps<{
  stack: Stack
  ingestUrl: string
}>()

const { copy, isCopied } = useCopyToClipboard()

const command = computed(() => testEventCommand(props.ingestUrl))

// The key is public and belongs on screen, but it is not the part anybody reads —
// splitting it lets the address stay legible at a glance.
const address = computed(() => props.ingestUrl.split('?')[0] ?? props.ingestUrl)
const query = computed(() => {
  const rest = props.ingestUrl.split('?')[1]
  return rest ? `?${rest}` : ''
})
</script>

<template>
  <div class="border-b border-rule px-1 py-9">
    <div class="eyebrow">
      <Radio :size="13" :stroke-width="2" class="text-accent" />
      listening · {{ props.stack.name }}
    </div>

    <h2 class="text-brand mt-[14px] mb-0 font-semibold tracking-[-0.02em] text-ink">
      no events yet
    </h2>

    <!--
      The flat line, and the axis that stops it being an ornament: the window is
      empty because this stack has never reported, which is true and is the point.
    -->
    <div class="trace mt-[18px]">
      <div class="trace-line" />
      <div class="trace-sweep" />
      <div
        class="text-label absolute right-0 bottom-[6px] left-0 flex justify-between text-ink-faint"
      >
        <span>10m ago</span>
        <span>now</span>
      </div>
    </div>

    <div class="text-meta mt-4 leading-[1.7] break-all text-ink-muted">
      {{ address }}<span class="text-ink-faint">{{ query }}</span>
    </div>

    <!--
      One line, not a paragraph. The heading, the flat trace and the axis underneath
      it have already said that nothing has arrived; what a reader cannot work out
      from the screen is that the two possible reasons are told apart by sending
      something. That is the only sentence left.
    -->
    <p class="text-note mt-[14px] mb-0 leading-[1.7] text-ink-muted">
      Nothing broken, or nothing reporting — send an event to find out which.
    </p>

    <div class="mt-7 border border-rule">
      <div class="flex items-baseline justify-between gap-4 border-b border-rule px-5 py-[14px]">
        <span class="eyebrow">
          <Send :size="13" :stroke-width="2" />
          test event
        </span>
        <button
          type="button"
          class="action text-meta"
          :class="isCopied('test-command') ? 'text-accent' : 'text-ink-dim hover:text-ink'"
          @click="copy('test-command', command)"
        >
          <component :is="isCopied('test-command') ? Check : Copy" :size="13" :stroke-width="2" />
          {{ isCopied('test-command') ? 'copied' : 'copy command' }}
        </button>
      </div>

      <!--
        Wrapped rather than scrolled: this exists to be read once and copied, and a
        horizontal scrollbar hides the half of the command carrying the key.
      -->
      <pre
        class="text-meta m-0 bg-raised p-[14px] leading-[1.7] font-[inherit] break-all whitespace-pre-wrap text-ink-muted"
        >{{ command }}</pre>

      <div class="text-note border-t border-rule px-5 py-3 text-ink-dim">
        Appears here within a second.
      </div>
    </div>
  </div>
</template>
