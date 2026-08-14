<script setup lang="ts">
import { ListTree } from 'lucide-vue-next'

import type { DisplayFrame } from '#shared/domain/types'

/**
 * Frames innermost-first, with source context where ingest captured it.
 *
 * Everything in here is untrusted text from a foreign process — a filename, a
 * function name, a line of somebody else's source. It is rendered as text and
 * never as markup, which Vue's interpolation gives us for free; the note is
 * here so nobody later reaches for v-html to get syntax highlighting.
 */
defineProps<{ frames: DisplayFrame[] }>()
</script>

<template>
  <div class="eyebrow mb-[14px]">
    <ListTree :size="13" :stroke-width="2" />
    stack trace
  </div>

  <div class="mb-[18px] bg-raised py-3">
    <div v-for="(frame, index) in frames" :key="index">
      <div class="text-meta px-4 py-[3px] text-ink-muted">
        at <span class="text-ink">{{ frame.func ?? '?' }}</span> ({{ frame.loc ?? 'unknown' }})
      </div>

      <div
        v-for="line in frame.code ?? []"
        :key="line.n"
        class="flex gap-[14px] px-4 py-[2px]"
        :class="line.err ? 'bg-level-error/8' : ''"
      >
        <span
          class="text-meta w-[26px] shrink-0 text-right select-none"
          :class="line.err ? 'text-level-error' : 'text-ink-faint'"
        >
          {{ line.n }}
        </span>
        <!-- `whitespace-pre` keeps the source's own indentation, which is often
             the only clue about which block a line belongs to. -->
        <span class="text-meta whitespace-pre" :class="line.err ? 'text-ink' : 'text-ink-muted'">{{
          line.text
        }}</span>
      </div>
    </div>

    <div v-if="frames.length === 0" class="text-meta px-4 py-[3px] text-ink-dim">
      no stack trace was captured
    </div>
  </div>
</template>
