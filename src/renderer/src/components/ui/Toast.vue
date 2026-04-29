<script setup lang="ts">
import { computed } from 'vue';
import { X } from 'lucide-vue-next';
import { cn } from '@/lib/utils';
import type { ToastItem } from '@/composables/useToast';

const props = defineProps<{ toast: ToastItem }>();
const emit = defineEmits<{ (e: 'dismiss', id: string): void }>();

const variantClass = computed(() => {
  switch (props.toast.variant) {
    case 'success':
      return 'border-emerald-500/40 bg-emerald-500/10 text-foreground';
    case 'error':
      return 'border-destructive/50 bg-destructive/10 text-foreground';
    default:
      return 'border-border bg-background text-foreground';
  }
});

const classes = computed(() =>
  cn(
    'pointer-events-auto relative flex w-80 items-start gap-3 rounded-md border p-3 pr-8 shadow-md',
    variantClass.value
  )
);
</script>

<template>
  <div :class="classes" role="status">
    <div class="flex-1 space-y-0.5">
      <p v-if="toast.title" class="text-sm font-medium leading-tight">{{ toast.title }}</p>
      <p v-if="toast.description" class="text-xs text-muted-foreground leading-snug">
        {{ toast.description }}
      </p>
    </div>
    <button
      type="button"
      class="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
      aria-label="Dismiss"
      @click="emit('dismiss', toast.id)"
    >
      <X class="h-3.5 w-3.5" />
    </button>
  </div>
</template>
