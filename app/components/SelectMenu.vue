<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { ChevronDown } from 'lucide-vue-next'
import type { Component } from 'vue'

/**
 * One value chosen from a known set, shown as the value itself.
 *
 * The filter row used to spell every option out — `stack all frontend api worker`
 * beside `env all production staging debug` — so it grew with the project and was
 * unreadable by the third stack. A menu shows the current answer and nothing else,
 * which is the point: on a page whose job is reading errors, a filter that is not
 * being changed should take one word.
 *
 * The leading icon is the label. `stack`/`env` were words in that row; as icons they
 * cost no width and the accessible name still carries them, which is what `ariaLabel`
 * is for. Anything read only by sighted-guessing would be a worse trade.
 */
const props = withDefaults(
  defineProps<{
    /** The chosen value. */
    value: string
    options: readonly { value: string; label: string }[]
    /** Names the control for assistive tech, since the trigger shows only a value. */
    ariaLabel: string
    icon?: Component
  }>(),
  { icon: undefined },
)

const emit = defineEmits<{ select: [value: string] }>()

const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const menu = useTemplateRef<HTMLElement>('menu')

// Same reasoning as the project menu it was extracted from: on a page this dense
// the reader's next click is almost always somewhere else, so a menu that only
// closes via its own trigger is a trap.
onClickOutside(root, () => {
  open.value = false
})

const current = computed(
  () => props.options.find((option) => option.value === props.value)?.label ?? props.value,
)

/**
 * Which edge the menu hangs from, measured rather than declared.
 *
 * This started as an `align` prop and that was the wrong contract: the page has no
 * breakpoints, so a filter sitting at the right-hand end of a row on a wide screen is
 * the same element that wraps to the left-hand edge on a narrow one. A call site
 * cannot answer "which side has room" because the answer changes with the viewport —
 * hardcoding `right` clipped this menu 18px off the left of a phone.
 *
 * Right is the *preferred* side rather than a neutral default, because that is where
 * these controls live: at the trailing end of a row, inside a 720px column that is
 * narrower than the window. Hanging leftward keeps the menu in the column; measuring
 * against the viewport instead would let it sit flush to the window edge, 42px outside
 * the text it belongs to, without ever counting as overflow.
 *
 * So: hang right, and fall back to left only when right would go off-screen *and*
 * left actually fits — a menu wider than the room on either side would otherwise just
 * exchange one overflow for another.
 */
const alignRight = ref(true)

watch(open, async (isOpen) => {
  if (!isOpen) return
  alignRight.value = true
  await nextTick()
  const el = menu.value
  const trigger = root.value
  if (!el || !trigger) return
  const rect = el.getBoundingClientRect()
  const fitsWhenFlipped =
    trigger.getBoundingClientRect().left + rect.width <= document.documentElement.clientWidth
  alignRight.value = !(rect.left < 0 && fitsWhenFlipped)
})

function choose(value: string) {
  open.value = false
  emit('select', value)
}
</script>

<template>
  <div ref="root" class="relative flex items-baseline" @keydown.esc="open = false">
    <button
      type="button"
      class="action text-row text-ink-muted hover:text-ink"
      :class="{ 'text-accent': open }"
      :aria-label="props.ariaLabel"
      :aria-expanded="open"
      aria-haspopup="true"
      @click="open = !open"
    >
      <component :is="props.icon" v-if="props.icon" :size="13" :stroke-width="2" />
      {{ current }}
      <ChevronDown :size="13" :stroke-width="2" class="text-ink-dim" />
    </button>

    <!-- Absolutely positioned, so it displaces nothing and a plain fade is enough. -->
    <Transition name="fade">
      <div
        v-if="open"
        ref="menu"
        class="absolute top-[22px] z-20 min-w-[140px] border border-rule bg-raised p-1"
        :class="alignRight ? 'right-0' : 'left-0'"
      >
        <button
          v-for="option in props.options"
          :key="option.value"
          type="button"
          class="action text-row w-full px-[10px] py-2 hover:bg-hover-menu hover:text-ink"
          :class="option.value === props.value ? 'text-accent' : 'text-ink-muted'"
          :aria-current="option.value === props.value"
          @click="choose(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>
