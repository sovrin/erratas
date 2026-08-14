<script setup lang="ts">
/**
 * The stack tabs in the install panel — the app's last tab row.
 *
 * It used to be "every filter control in the app"; the status tabs and the stack and
 * environment menus are tokens in the search box now. What is left is genuinely a tab
 * strip: picking which stack's snippet to show is not filtering anything.
 *
 * `size` is a prop rather than an overriding class on the call site because Tailwind
 * v4 moved the important modifier to a suffix, and a silently-ignored `!text-meta` is
 * exactly the kind of thing nobody notices until the type ramp has drifted.
 */
withDefaults(
  defineProps<{
    label: string
    active: boolean
    size?: 'row' | 'meta'
  }>(),
  { size: 'row' },
)
</script>

<template>
  <button
    type="button"
    :aria-pressed="active"
    class="action hover:text-ink"
    :class="[
      active ? 'text-accent' : 'text-ink-dim',
      size === 'row' ? 'text-row' : 'text-meta',
      'border-b px-0 pt-0 pb-[3px]',
      active ? 'border-accent' : 'border-transparent',
    ]"
  >
    {{ label }}
  </button>
</template>
