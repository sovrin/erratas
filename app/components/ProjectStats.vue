<script setup lang="ts">
import { formatAge } from '#shared/domain/relativeTime'
import type { ProjectSummary } from '#shared/issues/issueQuery'

/**
 * The line under the brand: the project's baseline, unaffected by the search.
 *
 * It replaced `1 stack · 4 unresolved · 9 events · 0 users affected`, which had three
 * problems. `0 users affected` was structurally always zero — the SDK sends no user, so
 * ingest has nothing to count — and a permanent zero beside real numbers reads as a
 * finding rather than a gap. `1 stack` is a setup fact, not a health signal, and it is
 * already on screen in the setup panel. And every segment was one flat grey, so nothing
 * in the line was more important than anything else.
 *
 * What is here instead answers the question somebody actually arrives with, which is not
 * "how many" but "is anything happening": what is outstanding, how much of it is *new*,
 * and how long since the project heard anything at all. Forty open issues and silence for
 * a week is a different situation from three that are all arriving now, and the old line
 * read identically for both.
 *
 * Every segment is a number then a label, and the number takes `ink` while the label takes
 * `ink-dim`. It is the division the chips and the tag grid already use — the value is what
 * is being read, the word beside it says what it is — so the line gains a hierarchy
 * without gaining any ink. Building them as a list rather than as markup is what keeps
 * that rule in one place instead of repeated five times.
 */
const props = defineProps<{ summary: ProjectSummary; now: number }>()

const emit = defineEmits<{ narrow: [key: string, value: string] }>()

interface Stat {
  value: string
  label: string
  /** Whether the number is worth the reader's eye, or is a quiet zero. */
  bright: boolean
  /** Present when the segment sets a filter, which is what earns it the accent. */
  narrow?: readonly [key: string, value: string]
  title?: string
}

const stats = computed<Stat[]>(() => {
  const { unresolved, newIn24h, events, stacks, lastEventAt } = props.summary

  return [
    {
      value: String(unresolved),
      label: 'unresolved',
      bright: unresolved > 0,
      narrow: ['status', 'unresolved'] as const,
      title: 'show only unresolved issues',
    },
    { value: String(newIn24h), label: 'new in 24h', bright: newIn24h > 0 },
    {
      value: events.toLocaleString(),
      label: events === 1 ? 'event' : 'events',
      bright: events > 0,
    },
    // Only worth a segment once there is more than one stack: with a single stack the
    // number says nothing a reader could act on, and it used to lead the line.
    ...(stacks > 1 ? [{ value: String(stacks), label: 'stacks', bright: true }] : []),
    lastEventAt
      ? { value: formatAge(lastEventAt, props.now), label: 'since last event', bright: true }
      : // No value rather than a zero: nothing has been reported, which is not an age.
        { value: '', label: 'nothing reported yet', bright: false },
  ]
})
</script>

<template>
  <div class="text-row mt-[10px] flex flex-wrap items-baseline gap-x-3 gap-y-1 text-ink-dim">
    <!--
      The separator is a child of the segment before it rather than a sibling between the
      two, so wrapping cannot strand it: as a sibling with its own gap it ended up alone at
      the end of a wrapped line, a floating dot with 12px of space in front of it.
    -->
    <component
      :is="stat.narrow ? 'button' : 'span'"
      v-for="(stat, index) in stats"
      :key="stat.label"
      :type="stat.narrow ? 'button' : undefined"
      :title="stat.title"
      :class="stat.narrow ? 'action' : 'flex items-baseline gap-[6px]'"
      @click="stat.narrow && emit('narrow', stat.narrow[0], stat.narrow[1])"
    >
      <!--
        Accent only where there is something to click — this design gives the accent to
        what is actionable and to nothing else. Elsewhere a number that matters is `ink`
        and a zero stays `ink-dim`, so an empty count does not draw the eye.
      -->
      <span
        v-if="stat.value !== ''"
        :class="
          stat.narrow && stat.bright ? 'text-accent' : stat.bright ? 'text-ink' : 'text-ink-dim'
        "
        >{{ stat.value }}</span
      >
      <span class="text-ink-dim"
        >{{ stat.label
        }}<span v-if="index < stats.length - 1" aria-hidden="true" class="pl-3 text-ink-faint"
          >·</span
        ></span
      >
    </component>
  </div>
</template>
