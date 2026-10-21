<script setup lang="ts">
import { errorMessage } from '#nexitas/app/lib/format'
import type { IssueDetail, IssueStatus } from '../../../../../shared/contracts'
import { formatAgeAgo } from '../../../../../shared/issues'
import { levelTones } from '../../../../lib/issues'

// One issue at its own address, which is what people paste to each other: where it happens, its
// stack trace, and what to do about it.
const project = useProject().id.value
const id = useRoute().params.id as string
const list = `/p/${project}/errors`
const api = `/api/p/${project}/errors/issues/${id}`
useHead({ title: `Issue · ${useRuntimeConfig().public.nexitas.name}` })
const { data: issue, error, refresh } = await useFetch<IssueDetail>(api)
useLive(refresh)
const now = ref(Date.now())
watch(issue, () => (now.value = Date.now()))

/** The list narrowed to one value of a dimension, for each clickable property. */
const narrowed = (key: string, value: string) => ({
  path: list,
  query: { q: `${key}:${value.split(/\s+/)[0]}` },
})

const pending = ref(false)
const actionError = ref('')
async function setStatus(status: IssueStatus) {
  pending.value = true
  actionError.value = ''
  try {
    issue.value = await $fetch<IssueDetail>(api, {
      method: 'POST',
      body: { status },
    })
  } catch (cause) {
    actionError.value = errorMessage(cause)
  } finally {
    pending.value = false
  }
}

const deleteOpen = ref(false)
async function remove() {
  actionError.value = ''
  try {
    await $fetch(`${api}/delete`, { method: 'POST', body: {} })
    await navigateTo(list)
  } catch (cause) {
    actionError.value = errorMessage(cause)
  }
}
</script>

<template>
  <div class="stack gap-5">
    <nav aria-label="Breadcrumb">
      <ol class="breadcrumb">
        <li><NuxtLink :to="list">Errors</NuxtLink></li>
        <li aria-current="page" class="font-mono">{{ id }}</li>
      </ol>
    </nav>

    <div v-if="error" class="alert" data-tone="danger" role="alert">
      <div><strong>Could not load this issue.</strong> {{ errorMessage(error) }}</div>
    </div>
    <template v-else-if="issue">
      <div class="page-header">
        <div class="stack gap-1 min-w-0">
          <!-- A title is a stranger's text: shown as text, wrapped, never as markup. -->
          <h1
            class="text-xl weight-600 break-words"
            :class="{ 'text-muted': issue.status !== 'unresolved' }"
          >
            {{ issue.title }}
          </h1>
          <p class="cluster gap-2 text-s text-muted">
            <span
              class="dot"
              :data-tone="issue.status === 'unresolved' ? levelTones[issue.level] : undefined"
              aria-hidden="true"
            ></span>
            <span>{{ issue.level }}, {{ issue.status }}</span>
            <span class="tabular"
              >· {{ issue.count.toLocaleString('en-GB') }}
              {{ issue.count === 1 ? 'event' : 'events' }}, last seen
              {{ formatAgeAgo(issue.lastSeen, now) }}</span
            >
          </p>
        </div>
        <div class="cluster gap-2">
          <template v-if="issue.status === 'unresolved'">
            <button
              type="button"
              class="btn"
              data-size="s"
              data-variant="primary"
              :disabled="pending"
              aria-describedby="status-help"
              @click="setStatus('resolved')"
            >
              Resolve
            </button>
            <button
              type="button"
              class="btn"
              data-size="s"
              :disabled="pending"
              aria-describedby="status-help"
              @click="setStatus('ignored')"
            >
              Ignore
            </button>
          </template>
          <button
            v-else
            type="button"
            class="btn"
            data-size="s"
            :disabled="pending"
            aria-describedby="status-help"
            @click="setStatus('unresolved')"
          >
            Reopen
          </button>
          <button
            type="button"
            class="btn"
            data-size="s"
            data-variant="ghost"
            data-tone="danger"
            @click="deleteOpen = true"
          >
            Delete
          </button>
        </div>
      </div>
      <small id="status-help" class="text-xs text-muted">{{
        issue.status === 'ignored'
          ? 'Ignored: new events still count, but never reopen it.'
          : 'A resolved issue reopens when it happens again.'
      }}</small>
      <div v-if="actionError" class="alert" data-tone="danger" role="alert">
        <div><strong>That did not work.</strong> {{ actionError }}</div>
      </div>

      <!-- The trace takes the room; where it happens sits beside it. -->
      <div class="with-aside">
        <section class="stack gap-3 min-w-0" aria-labelledby="trace-title">
          <h2 id="trace-title" class="text-s weight-600 hairline-b pb-2">Stack trace</h2>
          <p v-if="!issue.frames.length" class="text-s text-muted">No stack trace was captured.</p>
          <!-- Innermost frame first, with the source lines the SDK captured at throw time. -->
          <div v-for="(frame, index) in issue.frames" :key="index" class="stack gap-1">
            <p class="font-mono text-xs break-words">
              at <strong>{{ frame.func ?? '?' }}</strong>
              <span class="text-muted">({{ frame.loc ?? 'unknown' }})</span>
            </p>
            <pre
              v-if="frame.code?.length"
              class="font-mono text-xs"
              tabindex="0"
            ><code><template v-for="line in frame.code" :key="line.n"><mark v-if="line.err">{{ String(line.n).padStart(5) }}  {{ line.text }}</mark><span v-else class="text-muted">{{ String(line.n).padStart(5) }}  {{ line.text }}</span>
</template></code></pre>
          </div>
        </section>

        <aside class="stack gap-3" aria-labelledby="details-title">
          <h2 id="details-title" class="text-s weight-600 hairline-b pb-2">Where</h2>
          <!-- Values link to the list narrowed to them: is it one release, or all of them? -->
          <dl class="properties" data-stacked>
            <dt>Stack</dt>
            <dd>
              <NuxtLink :to="narrowed('stack', issue.stackName)" class="link">{{
                issue.stackName
              }}</NuxtLink>
            </dd>
            <template v-if="issue.environment">
              <dt>Environment</dt>
              <dd>
                <NuxtLink :to="narrowed('env', issue.environment)" class="link font-mono">{{
                  issue.environment
                }}</NuxtLink>
              </dd>
            </template>
            <template v-if="issue.release">
              <dt>Release</dt>
              <dd>
                <NuxtLink :to="narrowed('release', issue.release)" class="link font-mono">{{
                  issue.release
                }}</NuxtLink>
              </dd>
            </template>
            <dt>First seen</dt>
            <dd>
              <time :datetime="new Date(issue.firstSeen).toISOString()">{{
                formatAgeAgo(issue.firstSeen, now)
              }}</time>
            </dd>
            <template v-if="issue.culprit">
              <dt>Culprit</dt>
              <dd class="font-mono text-xs break-words">{{ issue.culprit }}</dd>
            </template>
          </dl>
        </aside>
      </div>
    </template>

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete this issue?"
      confirm-label="Delete issue"
      tone="danger"
      @confirm="remove"
    >
      <template #description
        >Removes the issue and its count. If it happens again, it comes back as new. This cannot be
        undone.</template
      >
    </ConfirmDialog>
  </div>
</template>
