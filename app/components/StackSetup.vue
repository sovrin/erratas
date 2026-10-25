<script setup lang="ts">
import { errorMessage } from '#nexitas/app/lib/format'
import type { Stack } from '../../shared/contracts'
import { buildDsn, buildIngestUrl, snippetFor, testEventCommand } from '../../shared/setup'

/** <StackSetup :stacks @changed="refresh" />
 *  erratas' setup: the project's stacks, each with the DSN and snippet its app reports with, and a
 *  way to add one. A stack is one runtime: the site, its API, a worker. In the Errors page's
 *  inspector, or in place of its content while the project has no stack. */
const props = defineProps<{ stacks: Stack[] }>()
const emit = defineEmits<{ changed: [] }>()
const project = useProject().id.value
const origin = useRequestURL().origin

const name = ref('')
const platform = ref('')
const { pending, error: addError, issues, fieldError, submit } = useSubmit()
async function add() {
  const added = await submit(() =>
    $fetch<Stack>(`/api/p/${project}/errors/stacks`, {
      method: 'POST',
      body: { name: name.value, platform: platform.value },
    }),
  )
  if (!added) return
  name.value = ''
  platform.value = ''
  emit('changed')
}

const removing = ref('')
const removeError = ref('')
async function remove(stack: Stack) {
  removing.value = stack.id
  removeError.value = ''
  try {
    await $fetch(`/api/p/${project}/errors/stacks/${stack.id}/delete`, {
      method: 'POST',
      body: {},
    })
    emit('changed')
  } catch (cause) {
    removeError.value = errorMessage(cause)
  } finally {
    removing.value = ''
  }
}
</script>

<template>
  <div class="stack gap-4">
    <!-- Each stack's delete stays with the stack it removes: one danger slot could not say which. -->
    <section
      v-for="stack in props.stacks"
      :key="stack.id"
      class="stack gap-2 hairline-b pb-3"
      :aria-label="`Stack ${stack.name}`"
    >
      <div class="cluster gap-3">
        <strong class="font-mono">{{ stack.name }}</strong>
        <span v-if="stack.platform" class="font-mono text-xs text-muted">{{ stack.platform }}</span>
        <DangerAction
          class="end"
          label="Delete stack"
          :title="`Delete ${stack.name}?`"
          :confirm-word="stack.name"
          :pending="removing === stack.id"
          @confirm="remove(stack)"
        >
          Its issues go with it, and apps reporting with its DSN get a 401. This cannot be undone.
        </DangerAction>
      </div>
      <details>
        <summary>Install, with its DSN</summary>
        <EmbedCode
          :code="snippetFor(stack.platform, buildDsn(origin, stack.publicKey, stack.id), origin)"
        />
      </details>
      <details>
        <summary>Send a test event</summary>
        <EmbedCode :code="testEventCommand(buildIngestUrl(origin, stack.publicKey, stack.id))" />
      </details>
    </section>
    <small v-if="props.stacks.length" class="text-xs text-muted"
      >Browsers may report only from the project's sites; servers send no origin and need only the
      DSN.</small
    >
    <AppAlert v-if="removeError" title="Could not delete the stack.">{{ removeError }}</AppAlert>

    <form class="stack gap-4" @submit.prevent="add">
      <div class="field">
        <label for="stack-name">Stack</label>
        <input
          id="stack-name"
          v-model="name"
          class="input"
          data-size="s"
          required
          maxlength="60"
          placeholder="frontend"
          autocomplete="off"
          :aria-invalid="!!fieldError('name') || undefined"
        />
        <span v-if="fieldError('name')" data-error>{{ fieldError('name') }}</span>
      </div>
      <div class="field">
        <label for="stack-platform">Platform</label>
        <input
          id="stack-platform"
          v-model="platform"
          class="input font-mono text-s"
          data-size="s"
          maxlength="40"
          placeholder="browser or node"
          autocomplete="off"
          spellcheck="false"
          :aria-invalid="!!fieldError('platform') || undefined"
        />
        <span v-if="fieldError('platform')" data-error>{{ fieldError('platform') }}</span>
      </div>

      <FormIssues :error="addError" :issues="issues" failed="Could not add the stack." />

      <div class="cluster gap-3 hairline-t pt-5">
        <button
          type="submit"
          class="btn end"
          data-size="s"
          data-variant="primary"
          :disabled="pending"
          :aria-busy="pending || undefined"
        >
          Add a stack
        </button>
      </div>
    </form>
  </div>
</template>
