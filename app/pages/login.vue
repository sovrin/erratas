<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'

const { signIn, signUp, isLoggedIn } = useAuth()
const config = useRuntimeConfig()

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

// Someone already signed in has no business on this page — most often arrived
// at by a bookmark or the back button.
watchEffect(() => {
  if (isLoggedIn.value) navigateTo('/')
})

async function submit() {
  if (busy.value) return
  if (!email.value.trim() || !password.value) {
    error.value = 'email and password are required'
    return
  }

  busy.value = true
  error.value = null
  try {
    await signIn(email.value.trim(), password.value)
    await navigateTo('/')
  } catch {
    // Deliberately not "no such account" versus "wrong password": the
    // difference tells an unauthenticated caller which addresses are
    // registered on this instance.
    error.value = 'those credentials did not work'
  } finally {
    busy.value = false
    password.value = ''
  }
}

async function register() {
  if (busy.value) return
  busy.value = true
  error.value = null
  try {
    await signUp(email.value.trim(), password.value, email.value.trim())
    await navigateTo('/')
  } catch {
    error.value = 'could not create that account'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="box-border w-full max-w-[320px] px-6 pt-[120px] pb-20">
    <AppBrand class="mb-12" />

    <form class="flex flex-col gap-6" @submit.prevent="submit">
      <input
        v-model="email"
        type="email"
        autocomplete="email"
        placeholder="email"
        aria-label="email"
        class="field text-body"
      />
      <input
        v-model="password"
        type="password"
        autocomplete="current-password"
        placeholder="password"
        aria-label="password"
        class="field text-body"
      />

      <button
        type="submit"
        :disabled="busy"
        class="text-body flex cursor-pointer items-center gap-[6px] border-none bg-transparent p-0 font-[inherit] text-accent hover:text-ink disabled:cursor-default disabled:text-ink-dim"
      >
        {{ busy ? 'signing in…' : 'sign in' }}
        <ArrowRight :size="13" :stroke-width="2" />
      </button>
    </form>

    <div v-if="error" class="text-note mt-6 text-level-error">{{ error }}</div>

    <div class="text-note mt-12 leading-[1.7] text-ink-dim">
      <template v-if="config.public.allowRegistration">
        no account yet?
        <button
          type="button"
          class="text-note cursor-pointer border-none bg-transparent p-0 font-[inherit] text-accent hover:text-ink"
          @click="register"
        >
          create one
        </button>
        with the address above.
      </template>
      <template v-else> registration is closed on this instance. </template>
    </div>
  </div>
</template>
