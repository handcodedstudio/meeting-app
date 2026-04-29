<script setup lang="ts">
import { ProgressRoot, ProgressIndicator } from 'reka-ui';
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<{ value?: number; max?: number; class?: string }>(),
  { value: 0, max: 100 }
);

const rootClass = computed(() =>
  cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', props.class)
);
const translate = computed(() => `translateX(-${100 - Math.min(100, Math.max(0, props.value))}%)`);
</script>

<template>
  <ProgressRoot :model-value="props.value" :max="props.max" :class="rootClass">
    <ProgressIndicator
      class="h-full bg-primary transition-transform duration-300"
      :style="{ transform: translate }"
    />
  </ProgressRoot>
</template>
