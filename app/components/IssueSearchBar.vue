<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'

const model = defineModel<string>({ required: true })

const focused = ref(false)
</script>

<template>
  <div
    class="mt-10 flex items-center gap-[10px] border px-[14px] py-[10px]"
    :class="focused ? 'border-accent' : 'border-rule'"
  >
    <Search :size="15" :stroke-width="2" class="shrink-0 text-ink-dim" />

    <!--
      The placeholder is the documentation. There is no help link and no syntax
      panel anywhere in this design, so the one place a reader can learn that
      `env:production` does something is the box itself.
    -->
    <input
      v-model="model"
      type="text"
      aria-label="search issues"
      placeholder="search — free text or env:production release:v2.4 user:lea os:macos"
      class="text-body flex-1 border-none bg-transparent p-0 font-[inherit] text-ink outline-none"
      @focus="focused = true"
      @blur="focused = false"
    />

    <button
      v-if="model.length > 0"
      type="button"
      aria-label="clear search"
      class="flex shrink-0 cursor-pointer items-center border-none bg-transparent p-0 text-ink-dim hover:text-ink"
      @click="model = ''"
    >
      <X :size="14" :stroke-width="2" />
    </button>
  </div>
</template>
