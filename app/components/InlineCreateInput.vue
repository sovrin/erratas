<script setup lang="ts">
/**
 * "Type a name, press enter" — how both projects and stacks get created.
 *
 * There is no form and no modal anywhere in this design; a new thing is made by
 * an input appearing where the button was. Escape cancels, blur cancels, and an
 * empty name cancels rather than creating something called "".
 */
const props = defineProps<{ placeholder: string; width: string }>()

const emit = defineEmits<{ submit: [value: string]; cancel: [] }>()

const value = ref('')
const input = useTemplateRef<HTMLInputElement>('input')

// The button the reader clicked has just been replaced by this field. Focusing
// it is what makes that read as one action rather than two.
onMounted(() => input.value?.focus())

function submit() {
  const name = value.value.trim()
  if (!name) {
    emit('cancel')
    return
  }
  emit('submit', name)
  value.value = ''
}
</script>

<template>
  <input
    ref="input"
    v-model="value"
    type="text"
    :placeholder="props.placeholder"
    class="field text-row border-b-accent py-[2px]"
    :style="{ width: props.width }"
    @keydown.enter.prevent="submit"
    @keydown.esc.prevent="emit('cancel')"
    @blur="emit('cancel')"
  />
</template>
