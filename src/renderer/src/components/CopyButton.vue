<script setup lang="ts">
import { Copy, Check } from 'lucide-vue-next';
import Button from './ui/Button.vue';
import { useClipboard } from '@/composables/useClipboard';

const props = withDefaults(
  defineProps<{
    text: string;
    label?: string;
    variant?: 'default' | 'secondary' | 'outline' | 'ghost';
    size?: 'default' | 'sm' | 'icon';
  }>(),
  { label: 'Copy', variant: 'ghost', size: 'sm' }
);

const { copied, copy } = useClipboard();

function onClick() {
  copy(props.text);
}
</script>

<template>
  <Button
    :variant="variant"
    :size="size"
    @click="onClick"
  >
    <Check
      v-if="copied"
      class="h-3.5 w-3.5"
    />
    <Copy
      v-else
      class="h-3.5 w-3.5"
    />
    <span
      v-if="size !== 'icon'"
      class="text-xs"
    >{{ copied ? 'Copied!' : label }}</span>
  </Button>
</template>
