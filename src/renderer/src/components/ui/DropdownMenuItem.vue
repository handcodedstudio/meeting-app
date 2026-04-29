<script setup lang="ts">
import { DropdownMenuItem } from 'reka-ui';
import { cn } from '@/lib/utils';
import { computed } from 'vue';

const props = defineProps<{ class?: string; disabled?: boolean }>();
const emit = defineEmits<{ (e: 'select', ev: Event): void }>();

const itemClass = computed(() =>
  cn(
    'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none',
    'data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
    props.class
  )
);
</script>

<template>
  <DropdownMenuItem :class="itemClass" :disabled="disabled" @select="(e: Event) => emit('select', e)">
    <slot />
  </DropdownMenuItem>
</template>
