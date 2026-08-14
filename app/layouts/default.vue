<script setup lang="ts">
// The shell is only a centred column — the two pages are different enough
// shapes (a 320px sign-in, a 720px board) that everything else belongs to them.
</script>

<template>
  <div class="flex min-h-dvh justify-center bg-ground text-ink">
    <slot />
  </div>
</template>
