<script setup lang="ts">
/**
 * Every filter control in the app.
 *
 * Two independent axes, both of which the design uses:
 *
 *   - `variant` ranks the control. Status is the primary filter and gets an
 *     underline when active; stack, environment and retention are secondary and
 *     signal with colour alone.
 *   - `size` is the type step. It is a prop rather than an overriding class on
 *     the call site because Tailwind v4 moved the important modifier to a
 *     suffix, and a silently-ignored `!text-meta` is exactly the kind of thing
 *     nobody notices until the type ramp has drifted.
 */
withDefaults(
  defineProps<{
    label: string
    active: boolean
    variant?: 'underline' | 'plain'
    size?: 'row' | 'meta'
  }>(),
  { variant: 'underline', size: 'row' },
)
</script>

<template>
  <button
    type="button"
    :aria-pressed="active"
    class="cursor-pointer border-none bg-transparent font-[inherit] hover:text-ink"
    :class="[
      active ? 'text-accent' : 'text-ink-dim',
      size === 'row' ? 'text-row' : 'text-meta',
      variant === 'underline'
        ? ['px-0 pt-0 pb-[3px] border-b', active ? 'border-accent' : 'border-transparent']
        : 'p-0',
    ]"
  >
    {{ label }}
  </button>
</template>
