<script setup lang="ts">
import { useToast } from '@/composables/useToast';
import Toast from './Toast.vue';

const { toasts, dismiss } = useToast();
</script>

<template>
  <div
    class="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2"
    aria-live="polite"
  >
    <Toast v-for="t in toasts" :key="t.id" :toast="t" @dismiss="dismiss" />
  </div>
</template>
