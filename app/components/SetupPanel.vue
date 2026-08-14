<script setup lang="ts">
import type { Project, Retention, Stack } from '#shared/domain/types'

/**
 * Composition only — this component owns no state and makes no decisions.
 *
 * It exists so the dashboard page reads as four sections rather than four
 * hundred lines, and so each section can be understood (and changed) without
 * the others.
 */
defineProps<{
  project: Project
  stacks: Stack[]
  canDelete: boolean
  dsnFor: (stack: Stack) => string
}>()

const emit = defineEmits<{
  renameProject: [name: string]
  retain: [retention: Retention]
  deleteProject: []
  createStack: [name: string]
  renameStack: [id: string, name: string]
  retargetStack: [id: string, platform: string]
  removeStack: [id: string]
}>()
</script>

<template>
  <div class="mt-9 border border-rule">
    <StackList
      :stacks="stacks"
      :dsn-for="dsnFor"
      @create="emit('createStack', $event)"
      @rename="(id, name) => emit('renameStack', id, name)"
      @retarget="(id, platform) => emit('retargetStack', id, platform)"
      @remove="emit('removeStack', $event)"
    />
    <InstallSnippet :stacks="stacks" :dsn-for="dsnFor" />
    <ProjectSettings
      :project="project"
      @rename="emit('renameProject', $event)"
      @retain="emit('retain', $event)"
    />
    <DeleteProjectRow :can-delete="canDelete" @confirm="emit('deleteProject')" />
  </div>
</template>
