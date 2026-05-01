<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{ modelValue: boolean; disabled?: boolean; id?: string; class?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const rootClass = computed(() =>
  cn(
    'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted',
    'disabled:cursor-not-allowed disabled:opacity-50',
    props.class
  )
);
</script>

<template>
  <SwitchRoot
    :id="id"
    :model-value="modelValue"
    :disabled="disabled"
    :class="rootClass"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <SwitchThumb class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-md ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
  </SwitchRoot>
</template>
