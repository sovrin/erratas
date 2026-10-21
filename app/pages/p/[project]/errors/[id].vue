<script setup lang="ts">
import { errorMessage, formatAge, plural } from '#nexitas/app/lib/format'
import type { IssueDetail, IssueStatus } from '../../../../../shared/contracts'
import { levelTones } from '../../../../lib/issues'

// One issue at its own address, which is what people paste to each other: where it happens, its
// stack trace, and what to do about it.
const project = useProject().id.value
const id = useRoute().params.id as string
const list = `/p/${project}/errors`
const api = `/api/p/${project}/errors/issues/${id}`
const { data: issue, error } = await useProjectFetch<IssueDetail>(`/errors/issues/${id}`)
const now = ref(Date.now())
watch(issue, () => (now.value = Date.now()))

/** The list narrowed to one value of a dimension, for each clickable property. */
const narrowed = (key: string, value: string) => ({
  path: list,
  query: { q: `${key}:${value.split(/\s+/)[0]}` },
})

const pending = ref(false)
const actionError = ref('')
const actionFailed = ref('')
async function setStatus(status: IssueStatus) {
  pending.value = true
  actionError.value = ''
  actionFailed.value = 'Could not change its status.'
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

async function remove() {
  actionError.value = ''
  actionFailed.value = 'Could not delete the issue.'
  try {
    await $fetch(`${api}/delete`, { method: 'POST', body: {} })
    await navigateTo(list)
  } catch (cause) {
    actionError.value = errorMessage(cause)
  }
}
</script>

<template>
  <!-- A title is a stranger's text: shown as text, wrapped, never as markup. -->
  <AppPage :title="issue?.title ?? 'Issue'" failed="Could not load this issue." :error="error">
    <template v-if="issue" #subtitle>
      <span class="cluster gap-2">
        <StateDot :tone="issue.status === 'unresolved' ? levelTones[issue.level] : undefined"
          >{{ issue.level }}, {{ issue.status }}</StateDot
        >
        <span class="tabular"
          >· {{ plural(issue.count, 'event') }}, last seen
          {{ formatAge(issue.lastSeen, now) }}</span
        >
      </span>
    </template>
    <template v-if="issue" #actions>
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
      <DangerAction
        label="Delete"
        title="Delete this issue?"
        confirm-label="Delete issue"
        @confirm="remove"
      >
        Removes the issue and its count. If it happens again, it comes back as new. This cannot be
        undone.
      </DangerAction>
    </template>

    <template v-if="issue">
      <small id="status-help" class="text-xs text-muted">{{
        issue.status === 'ignored'
          ? 'Ignored: new events still count, but never reopen it.'
          : 'A resolved issue reopens when it happens again.'
      }}</small>
      <AppAlert v-if="actionError" :title="actionFailed">{{ actionError }}</AppAlert>

      <!-- The trace takes the room; where it happens sits beside it. -->
      <AppSection title="Stack trace">
        <EmptyState v-if="!issue.frames.length">No stack trace was captured.</EmptyState>
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
      </AppSection>
    </template>

    <template v-if="issue" #aside>
      <AppSection title="Where">
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
              formatAge(issue.firstSeen, now)
            }}</time>
          </dd>
          <template v-if="issue.culprit">
            <dt>Culprit</dt>
            <dd class="font-mono text-xs break-words">{{ issue.culprit }}</dd>
          </template>
        </dl>
      </AppSection>
    </template>
  </AppPage>
</template>
