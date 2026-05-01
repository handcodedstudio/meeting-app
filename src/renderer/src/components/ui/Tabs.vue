<script setup lang="ts" generic="T extends string">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

interface TabOption {
  value: T;
  label: string;
  count?: number;
}

const props = withDefaults(
  defineProps<{
    tabs: TabOption[];
    modelValue: T;
    class?: string;
    listClass?: string;
  }>(),
  { class: '', listClass: '' }
);

const emit = defineEmits<{ (e: 'update:modelValue', value: T): void }>();

const listClasses = computed(() =>
  cn('flex gap-1 border-b border-border px-2 pt-2 overflow-x-auto', props.listClass)
);

function tabClasses(active: boolean): string {
  return cn(
    'shrink-0 inline-flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
  );
}
</script>

<template>
  <div :class="cn('flex flex-col min-h-0', props.class)">
    <div
      role="tablist"
      :class="listClasses"
    >
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        role="tab"
        :aria-selected="modelValue === tab.value"
        :class="tabClasses(modelValue === tab.value)"
        @click="emit('update:modelValue', tab.value)"
      >
        <span>{{ tab.label }}</span>
        <span
          v-if="tab.count !== undefined"
          class="rounded bg-background/60 px-1.5 text-[10px] font-normal tabular-nums text-muted-foreground"
        >
          {{ tab.count }}
        </span>
      </button>
    </div>
    <div class="flex-1 min-h-0">
      <slot />
    </div>
  </div>
</template>
