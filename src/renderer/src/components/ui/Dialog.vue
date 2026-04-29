<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose
} from 'reka-ui';
import { computed } from 'vue';
import { X } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

const props = defineProps<{
  open: boolean;
  title?: string;
  description?: string;
  class?: string;
}>();

const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>();

const contentClass = computed(() =>
  cn(
    'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
    'bg-background border border-border rounded-lg shadow-lg p-6',
    'focus:outline-none',
    props.class
  )
);
</script>

<template>
  <DialogRoot :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/50" />
      <DialogContent :class="contentClass">
        <div v-if="title || description" class="mb-4 space-y-1">
          <DialogTitle v-if="title" class="text-base font-semibold">{{ title }}</DialogTitle>
          <DialogDescription v-if="description" class="text-sm text-muted-foreground">
            {{ description }}
          </DialogDescription>
        </div>
        <slot />
        <DialogClose
          class="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close"
        >
          <X class="h-4 w-4" />
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
