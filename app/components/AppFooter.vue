<script setup lang="ts">
import { LogOut } from 'lucide-vue-next'

const props = defineProps<{ email: string }>()

const emit = defineEmits<{ signOut: [] }>()

const config = useRuntimeConfig()
</script>

<template>
  <div class="text-note mt-auto flex justify-between pt-14 text-ink-faint">
    <span>signed in as {{ props.email }}</span>

    <div class="flex items-center gap-4">
      <!--
        The version belongs down here with the account, not in the header: it is
        something you go looking for when reporting a problem, never something
        you read while triaging one.
      -->
      <span>v{{ config.public.appVersion }}</span>
      <button
        type="button"
        class="text-note flex cursor-pointer items-center gap-[6px] border-none bg-transparent p-0 font-[inherit] text-ink-faint hover:text-ink"
        @click="emit('signOut')"
      >
        <LogOut :size="12" :stroke-width="2" />
        sign out
      </button>
    </div>
  </div>
</template>
