<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'secondary' | 'outline' | 'destructive' | 'success';

const props = withDefaults(defineProps<{ variant?: Variant; class?: string }>(), {
  variant: 'default'
});

const variants: Record<Variant, string> = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  outline: 'border border-border text-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  success: 'bg-emerald-600 text-white'
};

const classes = computed(() =>
  cn(
    'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
    variants[props.variant],
    props.class
  )
);
</script>

<template>
  <span :class="classes"><slot /></span>
</template>
