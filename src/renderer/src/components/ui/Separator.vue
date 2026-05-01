<script setup lang="ts">
import { Separator } from 'reka-ui';
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<{ orientation?: 'horizontal' | 'vertical'; class?: string }>(),
  { orientation: 'horizontal' }
);

const classes = computed(() =>
  cn(
    'shrink-0 bg-border',
    props.orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full',
    props.class
  )
);
</script>

<template>
  <Separator
    :orientation="props.orientation"
    :class="classes"
  />
</template>
