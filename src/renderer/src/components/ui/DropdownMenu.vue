<script setup lang="ts">
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent
} from 'reka-ui';
import { cn } from '@/lib/utils';
import { computed } from 'vue';

const props = defineProps<{ class?: string; align?: 'start' | 'center' | 'end' }>();

const contentClass = computed(() =>
  cn(
    'z-50 min-w-[10rem] rounded-md border border-border bg-popover bg-background p-1 shadow-md text-sm',
    'focus:outline-none',
    props.class
  )
);
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent :align="align ?? 'end'" :class="contentClass" :side-offset="4">
        <slot />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
