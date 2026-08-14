<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { Plus, Search, X } from 'lucide-vue-next'

import type { Issue } from '#shared/domain/types'
import { composeQuery, splitQuery, type QueryTag } from '#shared/search/searchQuery'
import { applySuggestion, suggestSearch, type Suggestion } from '#shared/search/searchSuggestions'

/**
 * The board's only filter: free text, with settled filters as chips beside it.
 *
 * **Free text is the default reading of anything typed.** That is not a fallback — most
 * of what anybody types into a box above a list of errors is a fragment of an error
 * message. A word only becomes a filter once it is a registered key with a value, and
 * until then it filters titles, culprits and users like any search box.
 *
 * The raw string stays the single source of truth and the chips are derived from it, via
 * `splitQuery`/`composeQuery`. Holding chips as the primary state instead would mean
 * `?q=` on arrival and `setSearchToken` from the issue page — the two things that
 * write queries from outside this component — needed to know chips existed.
 *
 * The one piece of local state is `draft`: what is in the input right now. It cannot be
 * derived from the raw string on every keystroke, because a token becomes *complete* the
 * moment it has one character of value, and re-deriving would chip `env:d` the instant it
 * was typed and take the rest of the word with it. So a complete token is promoted to a
 * chip on an explicit commit — a space, or accepting a suggestion — and the raw string is
 * emitted from `draft` in between, which is what keeps the list filtering live while a
 * value is still half-typed.
 */
const props = defineProps<{
  /** The whole project's issues, for counting suggestion values. */
  issues: Issue[]
  stackName: (stackId: string) => string
  /** Issues the current query matches, shown as a running total. */
  resultCount: number
}>()

const model = defineModel<string>({ required: true })

const input = useTemplateRef<HTMLInputElement>('input')
const tags = ref<QueryTag[]>([])
const draft = ref('')
const focused = ref(false)
const caret = ref(0)
const activeIndex = ref(0)
const dismissed = ref(false)

/**
 * The last string this component put into the model.
 *
 * Without it the outward write below would bounce straight back in through the watcher
 * and re-derive `draft` from the raw string, which is exactly the mid-typing re-chipping
 * the draft exists to prevent. Only changes this component did not make are adopted.
 */
let emitted: string | null = null

function emitQuery() {
  const next = composeQuery(tags.value, draft.value)
  emitted = next
  model.value = next
}

watch(
  model,
  (raw) => {
    if (raw === emitted) return
    const split = splitQuery(raw)
    tags.value = split.tags
    draft.value = split.text
    emitted = raw
  },
  { immediate: true },
)

/**
 * The query as the suggestion engine sees it, with the caret mapped into it.
 *
 * Suggestions run against the *whole* query rather than just the input, so the value
 * counts are narrowed by the chips too — `env:` on a query already chipped to one release
 * says where that release is breaking. The engine finds the token to complete by caret
 * position, so the caret has to be offset past the chips it cannot see.
 */
const chipPrefix = computed(() => {
  const composed = composeQuery(tags.value, '')
  return composed === '' ? '' : `${composed} `
})

const result = computed(() =>
  suggestSearch({
    raw: `${chipPrefix.value}${draft.value}`,
    caret: chipPrefix.value.length + caret.value,
    issues: props.issues,
    ctx: { stackName: props.stackName },
  }),
)

const suggestions = computed(() => result.value.suggestions)

// `dismissed` is separate from `focused` so Escape can close the menu without giving up
// the field — the reader is still typing, they just want to see the list.
const menuOpen = computed(() => focused.value && !dismissed.value && suggestions.value.length > 0)

const hasQuery = computed(() => tags.value.length > 0 || draft.value.trim() !== '')

// The highlighted row must never point past the end of a list that changes on every
// keystroke, and re-anchoring to the top makes Enter predictable: it takes the best
// match for what is currently typed.
watch(suggestions, () => {
  activeIndex.value = 0
})

function syncCaret() {
  caret.value = input.value?.selectionStart ?? draft.value.length
}

/**
 * Promotes any complete token in the draft to a chip.
 *
 * Called on a trailing space rather than on every keystroke — a space is the reader
 * saying they are done with that token. Anything incomplete stays behind in the input.
 */
function commitDraft() {
  const split = splitQuery(draft.value)
  if (split.tags.length === 0) return
  tags.value = [...tags.value, ...split.tags]
  draft.value = split.text === '' ? '' : `${split.text} `
  emitQuery()
}

function onInput() {
  dismissed.value = false
  syncCaret()
  emitQuery()
  if (/\s$/.test(draft.value)) commitDraft()
}

async function accept(suggestion: Suggestion) {
  const applied = applySuggestion(`${chipPrefix.value}${draft.value}`, result.value, suggestion)
  const split = splitQuery(applied.raw)
  tags.value = split.tags
  // A key suggestion (`env:`) is incomplete by design and stays in the input, ready for
  // its value; a value suggestion completes the token, so `splitQuery` has already
  // chipped it and what is left here is whatever free text was alongside.
  draft.value = split.text
  emitQuery()

  await nextTick()
  const el = input.value
  if (!el) return
  el.focus()
  const offset = Math.max(0, Math.min(draft.value.length, applied.caret - chipPrefix.value.length))
  el.setSelectionRange(offset, offset)
  syncCaret()
}

function onEnter(event: KeyboardEvent) {
  const suggestion = suggestions.value[activeIndex.value]
  if (!menuOpen.value || !suggestion) {
    // No suggestion to take: commit whatever complete token is sitting in the draft, so
    // Enter always does the obvious thing rather than nothing.
    commitDraft()
    return
  }
  event.preventDefault()
  void accept(suggestion)
}

function move(delta: number) {
  if (!menuOpen.value) {
    dismissed.value = false
    return
  }
  const count = suggestions.value.length
  activeIndex.value = (activeIndex.value + delta + count) % count
}

/**
 * Backspace on an empty input takes the chip nearest the caret.
 *
 * The behaviour anyone who has used a tag input expects, and the only way to remove a
 * chip without the pointer.
 */
function onBackspace(event: KeyboardEvent) {
  if (draft.value !== '' || tags.value.length === 0) return
  event.preventDefault()
  removeTag(tags.value.length - 1)
}

function removeTag(index: number) {
  tags.value = tags.value.filter((_, i) => i !== index)
  emitQuery()
  input.value?.focus()
}

function clear() {
  tags.value = []
  draft.value = ''
  emitQuery()
  input.value?.focus()
}

function openMenu() {
  dismissed.value = false
  activeIndex.value = 0
  input.value?.focus()
}

function onFocus() {
  focused.value = true
  syncCaret()
}

// `/` focuses the box from anywhere on the page, the way it does in a pager or a
// browser's own find. Guarded on the target so typing a slash into any other field is
// still typing a slash.
onKeyStroke('/', (event) => {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
  event.preventDefault()
  input.value?.focus()
})
</script>

<template>
  <div class="relative mt-10">
    <!--
      Clicking anywhere in the box focuses the input, so the chips and the whitespace
      around them behave like part of one field rather than like separate controls.
    -->
    <div
      class="flex flex-wrap items-center gap-[6px] border px-[10px] py-[8px]"
      :class="focused ? 'border-accent' : 'border-rule'"
      @click="input?.focus()"
    >
      <Search :size="14" :stroke-width="2" class="shrink-0 text-ink-dim" />

      <SearchChip
        v-for="(tag, index) in tags"
        :key="`${tag.key}:${tag.value}:${index}`"
        :tag-key="tag.key"
        :value="tag.value"
        @remove="removeTag(index)"
      />

      <input
        ref="input"
        v-model="draft"
        type="text"
        aria-label="search issues"
        :aria-expanded="menuOpen"
        aria-haspopup="listbox"
        autocomplete="off"
        spellcheck="false"
        :placeholder="tags.length > 0 ? '' : 'search issues — press / anywhere'"
        class="text-body min-w-[120px] flex-1 border-none bg-transparent p-0 font-[inherit] text-ink outline-none"
        @focus="onFocus"
        @blur="focused = false"
        @input="onInput"
        @click.stop="syncCaret"
        @keyup="syncCaret"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.tab="onEnter"
        @keydown.enter="onEnter"
        @keydown.delete="onBackspace"
        @keydown.esc.prevent="dismissed = true"
      />

      <!-- A running total, so narrowing has a number attached to it. -->
      <span v-if="hasQuery" class="text-meta shrink-0 text-ink-dim">{{ props.resultCount }}</span>

      <!--
        The way in for anyone who does not know the box takes `key:value` at all. The
        chips show what a filter looks like once there is one; before that, this is the
        only thing on screen that says filters exist.
      -->
      <button
        type="button"
        aria-label="add a filter"
        title="add a filter"
        class="action shrink-0"
        :class="menuOpen ? 'text-accent' : 'text-ink-dim hover:text-accent'"
        @click.stop="openMenu"
      >
        <Plus :size="14" :stroke-width="2" />
      </button>

      <button
        v-if="hasQuery"
        type="button"
        aria-label="clear search"
        class="action shrink-0 text-ink-dim hover:text-ink"
        @click.stop="clear"
      >
        <X :size="14" :stroke-width="2" />
      </button>
    </div>

    <Transition name="fade">
      <div
        v-if="menuOpen"
        class="absolute top-full right-0 left-0 z-20 border border-t-0 border-rule bg-raised"
      >
        <!--
          `mousedown` rather than `click`: the input blurs on mousedown, which closes the
          menu and takes the click target with it before `click` ever fires.
        -->
        <button
          v-for="(suggestion, index) in suggestions"
          :key="suggestion.insert"
          type="button"
          class="action text-row flex w-full items-baseline justify-between gap-4 px-[14px] py-2"
          :class="index === activeIndex ? 'bg-hover-menu text-ink' : 'text-ink-muted'"
          @mousedown.prevent="accept(suggestion)"
          @mouseenter="activeIndex = index"
        >
          <span :class="suggestion.kind === 'key' ? 'text-accent' : ''">{{
            suggestion.label
          }}</span>
          <span class="text-meta shrink-0 text-ink-dim">
            {{ suggestion.kind === 'key' ? suggestion.hint : suggestion.count }}
          </span>
        </button>
      </div>
    </Transition>
  </div>
</template>
