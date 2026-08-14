<script setup lang="ts">
import type { IssueLevel } from '#shared/domain/types'

/**
 * The 7px round dot — the one exception to "no border radius anywhere".
 *
 * It lives in its own component because the exception should have exactly one
 * home: three call sites were each writing `rounded-full` themselves, two of
 * them were mapping level to colour with their own copy of the same table, and
 * both of those had reached for a raw `bg-[#333333]` for the retired state —
 * a grey that is on no step of the ramp. Centralising it is what keeps the
 * rounded corner from spreading and the palette from growing by accident.
 *
 * `tone` rather than `level`, because the dot answers a slightly wider question
 * than severity: `retired` is a resolved or ignored issue, whose severity is no
 * longer the point.
 */
const props = defineProps<{ tone: IssueLevel | 'retired' }>()

const TONES: Record<IssueLevel | 'retired', string> = {
  error: 'bg-level-error',
  warning: 'bg-level-warning',
  info: 'bg-level-info',
  // `ink-faint` rather than a new grey: it is the ramp's "present but inactive"
  // value, already carrying that meaning for the flat trace line.
  retired: 'bg-ink-faint',
}
</script>

<template>
  <span class="size-[7px] shrink-0 self-center rounded-full" :class="TONES[props.tone]" />
</template>
