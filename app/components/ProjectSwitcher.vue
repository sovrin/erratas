<script setup lang="ts">
// Explicit imports: @vueuse/nuxt is not installed, so nothing from @vueuse/core
// is auto-imported, and lucide is a plain package rather than a Nuxt module.
import { onClickOutside } from '@vueuse/core'
import { ChevronDown, Plus } from 'lucide-vue-next'

import type { Project } from '#shared/domain/types'

/**
 * Not a `SelectMenu`, though it looks like one.
 *
 * A menu of projects also has to *create* a project, and that item is an action
 * rather than one of the answers — it opens an input where the button was instead
 * of choosing a value. Bending `SelectMenu` into carrying an arbitrary footer, so
 * that one caller can put a verb among its nouns, would make every other filter
 * pay for it. The shared part is small and the two behave differently.
 */
const props = defineProps<{ projects: Project[]; current: Project | null }>()

const emit = defineEmits<{ open: [projectId: string]; create: [name: string] }>()

const menuOpen = ref(false)
const creating = ref(false)
const root = useTemplateRef<HTMLElement>('root')

// A dropdown that only closes by clicking its own trigger is a trap on a page
// this dense — the reader's next click is almost always somewhere else.
onClickOutside(root, () => {
  menuOpen.value = false
})

function startCreating() {
  menuOpen.value = false
  creating.value = true
}

function create(name: string) {
  creating.value = false
  emit('create', name)
}

function open(projectId: string) {
  menuOpen.value = false
  emit('open', projectId)
}
</script>

<template>
  <div ref="root" class="relative flex items-baseline" @keydown.esc="menuOpen = false">
    <InlineCreateInput
      v-if="creating"
      placeholder="project name, enter to create"
      width="240px"
      @submit="create"
      @cancel="creating = false"
    />

    <button
      v-else
      type="button"
      :aria-expanded="menuOpen"
      aria-haspopup="true"
      aria-label="switch project"
      class="action text-body text-ink-muted hover:text-ink"
      :class="{ 'text-accent': menuOpen }"
      @click="menuOpen = !menuOpen"
    >
      {{ props.current?.name ?? 'no project' }}
      <ChevronDown :size="13" :stroke-width="2" class="text-ink-dim" />
    </button>

    <!-- Absolutely positioned, so it displaces nothing and a plain fade is enough. -->
    <Transition name="fade">
      <div
        v-if="menuOpen"
        class="absolute top-[26px] right-0 z-20 min-w-[200px] border border-rule bg-raised p-1"
      >
        <button
          v-for="project in props.projects"
          :key="project.id"
          type="button"
          class="action text-row w-full px-[10px] py-2 hover:bg-hover-menu hover:text-ink"
          :class="project.id === props.current?.id ? 'text-accent' : 'text-ink-muted'"
          :aria-current="project.id === props.current?.id"
          @click="open(project.id)"
        >
          {{ project.name }}
        </button>

        <button
          type="button"
          class="action text-row w-full px-[10px] py-2 text-accent hover:bg-hover-menu"
          @click="startCreating"
        >
          <Plus :size="13" :stroke-width="2" />
          new project
        </button>
      </div>
    </Transition>
  </div>
</template>
