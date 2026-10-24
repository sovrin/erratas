<script setup lang="ts">
import { errorMessage, formatAge, formatCount, plural } from '#nexitas/app/lib/format'
import type { DisplayFrame, IssueDetail, IssueStatus } from '../../../../../shared/contracts'
import { issuesKey, levelTones } from '../../../../lib/issues'

// One issue at its own address, which is what people paste to each other: the list, with the
// issue in the inspector (what to do about it, where it happens, its stack trace).
const project = useProject().id.value
const route = useRoute()
const id = route.params.id as string
const list = `/p/${project}/errors`
const api = `/api/p/${project}/errors/issues/${id}`
const { data: issue, error } = await useProjectFetch<IssueDetail>(`/errors/issues/${id}`)
const now = ref(Date.now())
watch(issue, () => (now.value = Date.now()))

/** The list narrowed to one value of a dimension, for each clickable property, whatever the
 *  issues' status. */
const narrowed = (key: string, value: string) => ({
  path: list,
  query: { status: 'all', q: `${key}:${value.split(/\s+/)[0]}` },
})

// A long path breaks after its slashes, never inside a name.
const atSlashes = (path: string) => path.split(/(?<=\/)/)
// The culprit names one frame as "func (loc)": that frame is tinted in the trace.
const isCulprit = (frame: DisplayFrame) =>
  `${frame.func ?? '?'} (${frame.loc ?? 'unknown'})` === issue.value?.culprit

const pending = ref(false)
const statusError = ref('')
const actions = ref<HTMLElement>()
async function setStatus(status: IssueStatus) {
  pending.value = true
  statusError.value = ''
  try {
    issue.value = await $fetch<IssueDetail>(api, {
      method: 'POST',
      body: { status },
    })
    // The list beside it shows the status too.
    await refreshNuxtData(issuesKey(project))
  } catch (cause) {
    statusError.value = errorMessage(cause)
  } finally {
    pending.value = false
  }
  // The button pressed gives way to the other status's: focus goes to its replacement.
  await nextTick()
  if (!actions.value?.contains(document.activeElement))
    actions.value?.querySelector('button')?.focus()
}

const removing = ref(false)
const removeError = ref('')
async function remove() {
  removing.value = true
  removeError.value = ''
  try {
    await $fetch(`${api}/delete`, { method: 'POST', body: {} })
    await navigateTo({ path: list, query: route.query })
  } catch (cause) {
    removeError.value = errorMessage(cause)
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <!-- A title is a stranger's text: it heads the inspector as text, wrapped, never as markup. -->
  <IssueBoard :selected="id" :aside-name="issue?.title">
    <template #aside>
      <AppAlert v-if="error" title="Could not load this issue.">{{ errorMessage(error) }}</AppAlert>
      <div v-else-if="issue" class="stack gap-5">
        <AppAlert v-if="statusError" title="Could not change its status.">{{
          statusError
        }}</AppAlert>
        <div class="stack gap-2">
          <div class="cluster justify-between items-center gap-2">
            <span class="text-s">
              <StateDot :tone="issue.status === 'unresolved' ? levelTones[issue.level] : undefined"
                >{{ issue.level }} · {{ issue.status }}</StateDot
              >
            </span>
            <div ref="actions" class="cluster gap-2">
              <template v-if="issue.status === 'unresolved'">
                <button
                  type="button"
                  class="btn"
                  data-size="s"
                  data-variant="primary"
                  :disabled="pending"
                  :aria-busy="pending || undefined"
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
                  :aria-busy="pending || undefined"
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
                :aria-busy="pending || undefined"
                aria-describedby="status-help"
                @click="setStatus('unresolved')"
              >
                Reopen
              </button>
            </div>
          </div>
          <small id="status-help" class="text-xs text-muted">{{
            issue.status === 'ignored'
              ? 'Ignored: new events still count, but never reopen it.'
              : 'A resolved issue reopens when it happens again.'
          }}</small>
        </div>

        <!-- Values link to the list narrowed to them: is it one release, or all of them? -->
        <dl class="properties">
          <dt>Stack</dt>
          <dd>
            <NuxtLink :to="narrowed('stack', issue.stackName)" class="link font-mono" data-quiet>{{
              issue.stackName
            }}</NuxtLink>
          </dd>
          <dt>First seen</dt>
          <dd>
            <time :datetime="new Date(issue.firstSeen).toISOString()">{{
              formatAge(issue.firstSeen, now)
            }}</time>
          </dd>
          <dt>Last seen</dt>
          <dd>
            <time :datetime="new Date(issue.lastSeen).toISOString()">{{
              formatAge(issue.lastSeen, now)
            }}</time>
          </dd>
          <dt>Events</dt>
          <dd class="tabular">{{ formatCount(issue.count) }}</dd>
          <template v-if="issue.release">
            <dt>Release</dt>
            <dd>
              <NuxtLink
                :to="narrowed('release', issue.release)"
                class="link font-mono"
                data-quiet
                >{{ issue.release }}</NuxtLink
              >
            </dd>
          </template>
          <template v-if="issue.environment">
            <dt>Environment</dt>
            <dd>
              <NuxtLink
                :to="narrowed('env', issue.environment)"
                class="link font-mono"
                data-quiet
                >{{ issue.environment }}</NuxtLink
              >
            </dd>
          </template>
          <template v-if="issue.culprit">
            <dt>Culprit</dt>
            <dd class="font-mono text-xs">
              <template v-for="(part, index) in atSlashes(issue.culprit)" :key="index"
                >{{ part }}<wbr
              /></template>
            </dd>
          </template>
        </dl>

        <AppSection title="Stack trace">
          <EmptyState v-if="!issue.frames.length">No stack trace was captured.</EmptyState>
          <!-- Innermost frame first, numbered, in a well; the culprit's frame in the module's
               tint, with the source lines the SDK captured at throw time. -->
          <ol v-if="issue.frames.length" class="bg-sunken p-3 ps-6 font-mono text-s">
            <li
              v-for="(frame, index) in issue.frames"
              :key="index"
              :class="{ 'bg-tint p-2': isCulprit(frame) }"
            >
              <span
                ><span class="nowrap"
                  >at <strong>{{ frame.func ?? '?' }}</strong></span
                >
                <span class="text-muted"
                  >(<template v-for="(part, at) in atSlashes(frame.loc ?? 'unknown')" :key="at"
                    >{{ part }}<wbr /></template
                  >)</span
                ></span
              >
              <pre
                v-if="frame.code?.length"
                class="font-mono text-s mt-1"
                tabindex="0"
              ><code><template v-for="line in frame.code" :key="line.n"><mark v-if="line.err">{{ String(line.n).padStart(5) }}  {{ line.text }}</mark><span v-else class="text-muted">{{ String(line.n).padStart(5) }}  {{ line.text }}</span>
</template></code></pre>
            </li>
          </ol>
        </AppSection>
      </div>
    </template>

    <template v-if="issue" #danger>
      <span>Removes the issue and its {{ plural(issue.count, 'event') }}.</span>
      <DangerAction
        label="Delete issue"
        title="Delete this issue?"
        :pending="removing"
        @confirm="remove"
      >
        If it happens again, it comes back as new. This cannot be undone.
      </DangerAction>
      <AppAlert v-if="removeError" title="Could not delete the issue.">{{ removeError }}</AppAlert>
    </template>
  </IssueBoard>
</template>
