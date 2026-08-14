<script setup lang="ts">
// Explicit imports: @vueuse/nuxt is not installed, so nothing from @vueuse/core
// is auto-imported, and lucide is a plain package rather than a Nuxt module.
import { onClickOutside } from '@vueuse/core'
import { ChevronDown, Plus } from 'lucide-vue-next'

import type { Project } from '#shared/domain/types'

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
  <div ref="root" class="relative flex items-baseline">
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
      class="text-body flex cursor-pointer items-center gap-[5px] border-none bg-transparent p-0 font-[inherit] text-ink-muted hover:text-ink"
      @click="menuOpen = !menuOpen"
    >
      {{ props.current?.name ?? 'no project' }}
      <ChevronDown :size="13" :stroke-width="2" />
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
          class="text-row block w-full cursor-pointer border-none bg-transparent px-[10px] py-2 text-left font-[inherit] hover:bg-hover-menu hover:text-ink"
          :class="project.id === props.current?.id ? 'text-accent' : 'text-ink-muted'"
          @click="open(project.id)"
        >
          {{ project.name }}
        </button>

        <button
          type="button"
          class="text-row flex w-full cursor-pointer items-center gap-[6px] border-none bg-transparent px-[10px] py-2 text-left font-[inherit] text-accent hover:bg-hover-menu"
          @click="startCreating"
        >
          <Plus :size="12" :stroke-width="2" />
          new project
        </button>
      </div>
    </Transition>
  </div>
</template>
