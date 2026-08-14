<script setup lang="ts">
import { RETENTIONS, type Project, type Retention } from '#shared/domain/types'

const props = defineProps<{ project: Project }>()

const emit = defineEmits<{ rename: [name: string]; retain: [retention: Retention] }>()
</script>

<template>
  <div class="border-t border-rule px-5 py-[18px]">
    <div class="text-label mb-[14px] tracking-[0.1em] text-ink-dim uppercase">project</div>

    <div class="mb-3 flex items-center gap-3">
      <span class="text-row w-[70px] shrink-0 text-ink-muted">name</span>
      <input
        :value="props.project.name"
        type="text"
        aria-label="project name"
        class="field text-row w-[200px] py-[2px]"
        @change="emit('rename', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="flex items-baseline gap-3">
      <span class="text-row w-[70px] shrink-0 text-ink-muted">retention</span>
      <TabButton
        v-for="option in RETENTIONS"
        :key="option"
        :label="option"
        :active="props.project.retention === option"
        variant="plain"
        @click="emit('retain', option)"
      />
      <!--
        Stated plainly because retention is the one setting here that destroys
        data. A reader who skims this row and picks 30d should not be surprised
        later.
      -->
      <span class="text-note text-ink-faint">events older than this are deleted</span>
    </div>
  </div>
</template>
