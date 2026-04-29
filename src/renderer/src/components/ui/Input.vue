<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  modelValue?: string | number;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  class?: string;
  id?: string;
  autocomplete?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
  (e: 'blur', ev: FocusEvent): void;
  (e: 'keydown', ev: KeyboardEvent): void;
}>();

const classes = computed(() =>
  cn(
    'flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm',
    'placeholder:text-muted-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:cursor-not-allowed disabled:opacity-50',
    props.invalid ? 'border-destructive' : 'border-border',
    props.class
  )
);

function onInput(e: Event) {
  const target = e.target as HTMLInputElement;
  emit('update:modelValue', target.value);
}
</script>

<template>
  <input
    :id="id"
    :class="classes"
    :type="type ?? 'text'"
    :placeholder="placeholder"
    :disabled="disabled"
    :autocomplete="autocomplete"
    :value="modelValue"
    @input="onInput"
    @blur="emit('blur', $event)"
    @keydown="emit('keydown', $event)"
  />
</template>
