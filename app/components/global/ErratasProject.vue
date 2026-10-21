<script setup lang="ts">
import { errorMessage } from '#nexitas/app/lib/format'
import type { ProjectSummary } from '#nexitas/shared/contracts'
import type { Stack } from '../../../shared/contracts'
import { buildDsn, buildIngestUrl, snippetFor, testEventCommand } from '../../../shared/setup'

/** erratas' part of a project's page: its stacks, each with the DSN and snippet its app reports
 *  with, and a way to add one. A stack is one runtime: the site, its API, a worker. */
const props = defineProps<{ project: ProjectSummary }>()
const {
  data: stacks,
  error,
  refresh,
} = await useFetch<Stack[]>(`/api/p/${props.project.id}/errors/stacks`, {
  key: `erratas-stacks-${props.project.id}`,
})
useLive(refresh)
const origin = useRequestURL().origin
/** What erratas says about this project, as the overview shows it. */
const status = computed(
  () => props.project.status.find((entry) => entry.module === 'erratas')?.items ?? [],
)

const name = ref('')
const platform = ref('')
const pending = ref(false)
const addError = ref('')
async function add() {
  pending.value = true
  addError.value = ''
  try {
    await $fetch(`/api/p/${props.project.id}/errors/stacks`, {
      method: 'POST',
      body: { name: name.value, platform: platform.value },
    })
    name.value = ''
    platform.value = ''
    await refresh()
  } catch (cause) {
    addError.value = errorMessage(cause)
  } finally {
    pending.value = false
  }
}

const removing = ref<Stack>()
const removeOpen = ref(false)
const removeError = ref('')
async function remove() {
  removeError.value = ''
  try {
    await $fetch(`/api/p/${props.project.id}/errors/stacks/${removing.value!.id}/delete`, {
      method: 'POST',
      body: {},
    })
    await refresh()
  } catch (cause) {
    removeError.value = errorMessage(cause)
  }
}
</script>

<template>
  <!-- Under the module's name and icon, which the project page puts above it. -->
  <div class="stack gap-4">
    <div v-if="error" class="alert" data-tone="danger" role="alert">
      <div><strong>Could not load its stacks.</strong> {{ errorMessage(error) }}</div>
    </div>
    <template v-else-if="stacks">
      <!-- The figure first, as every panel leads with one; the setup folds away below it. -->
      <p v-if="stacks.length" class="cluster gap-3 text-s">
        <StatusItems :items="status" />
        <NuxtLink :to="`/p/${project.id}/errors`" class="link">Its issues</NuxtLink>
      </p>
      <p v-else class="text-s text-muted">
        Reports what breaks in its apps. Add a stack for each runtime, such as the site and its API,
        to get the DSN it reports with.
      </p>

      <section
        v-for="stack in stacks"
        :key="stack.id"
        class="stack gap-2 hairline-b pb-3"
        :aria-label="`Stack ${stack.name}`"
      >
        <div class="cluster gap-3">
          <strong class="text-s">{{ stack.name }}</strong>
          <span v-if="stack.platform" class="font-mono text-xs text-muted">{{
            stack.platform
          }}</span>
          <button
            type="button"
            class="link text-s text-danger end"
            @click="((removing = stack), (removeOpen = true))"
          >
            Remove
          </button>
        </div>
        <details>
          <summary class="text-s">Install, with its DSN</summary>
          <EmbedCode
            :code="snippetFor(stack.platform, buildDsn(origin, stack.publicKey, stack.id), origin)"
          />
        </details>
        <details>
          <summary class="text-s">Send a test event</summary>
          <EmbedCode :code="testEventCommand(buildIngestUrl(origin, stack.publicKey, stack.id))" />
        </details>
      </section>
      <small v-if="stacks.length" class="text-xs text-muted"
        >Browsers may report only from the project's sites; servers send no origin and need only the
        DSN.</small
      >
      <div v-if="removeError" class="alert" data-tone="danger" role="alert">
        <div><strong>Could not remove the stack.</strong> {{ removeError }}</div>
      </div>

      <form class="cluster gap-3 items-end" @submit.prevent="add">
        <div class="field">
          <label :for="`stack-name-${project.id}`">Stack</label>
          <input
            :id="`stack-name-${project.id}`"
            v-model="name"
            class="input"
            data-size="s"
            required
            maxlength="60"
            placeholder="frontend"
            autocomplete="off"
          />
        </div>
        <div class="field">
          <label :for="`stack-platform-${project.id}`">Platform</label>
          <input
            :id="`stack-platform-${project.id}`"
            v-model="platform"
            class="input font-mono text-s"
            data-size="s"
            maxlength="40"
            placeholder="browser or node"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <button
          type="submit"
          class="btn"
          data-size="s"
          :disabled="pending"
          :aria-busy="pending || undefined"
        >
          Add a stack
        </button>
      </form>
      <div v-if="addError" class="alert" data-tone="danger" role="alert">
        <div><strong>Could not add the stack.</strong> {{ addError }}</div>
      </div>
    </template>

    <ConfirmDialog
      v-model:open="removeOpen"
      :title="`Remove ${removing?.name}?`"
      confirm-label="Remove stack"
      tone="danger"
      @confirm="remove"
    >
      <template #description
        >Its issues go with it, and apps reporting with its DSN get a 401. This cannot be
        undone.</template
      >
    </ConfirmDialog>
  </div>
</template>
