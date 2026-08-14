<script setup lang="ts">
import { Clock, Folder } from 'lucide-vue-next'

import { RETENTIONS, type Project, type Retention } from '#shared/domain/types'

const props = defineProps<{ project: Project }>()

const emit = defineEmits<{ rename: [name: string]; retain: [retention: Retention] }>()

const retentionOptions = RETENTIONS.map((option) => ({ value: option, label: option }))
</script>

<template>
  <div class="border-t border-rule px-5 py-[18px]">
    <div class="eyebrow mb-[14px]">
      <Folder :size="13" :stroke-width="2" />
      project
    </div>

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

    <div class="flex flex-wrap items-baseline gap-3">
      <span class="text-row w-[70px] shrink-0 text-ink-muted">retention</span>
      <SelectMenu
        :value="props.project.retention"
        :options="retentionOptions"
        :icon="Clock"
        aria-label="retention period"
        @select="emit('retain', $event as Retention)"
      />
      <!--
        Kept, though every other hint in this panel was cut: retention is the one
        setting here that destroys data, and a reader who skims the row and picks
        30d should not find that out later. Shorter, not gone.
      -->
      <span class="text-note text-ink-faint">older events are deleted</span>
    </div>
  </div>
</template>
