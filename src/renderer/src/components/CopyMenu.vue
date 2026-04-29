<script setup lang="ts">
import { Copy, Check, ChevronDown } from 'lucide-vue-next';
import Button from './ui/Button.vue';
import DropdownMenu from './ui/DropdownMenu.vue';
import DropdownMenuItem from './ui/DropdownMenuItem.vue';
import { useClipboard } from '@/composables/useClipboard';

interface CopyOption {
  label: string;
  value: string;
}

const props = withDefaults(
  defineProps<{
    options: CopyOption[];
    label?: string;
    variant?: 'default' | 'secondary' | 'outline' | 'ghost';
    size?: 'default' | 'sm' | 'icon';
  }>(),
  { label: 'Copy', variant: 'ghost', size: 'sm' }
);

const { copied, copy } = useClipboard();

function selectOption(opt: CopyOption) {
  void copy(opt.value);
}

void props;
</script>

<template>
  <DropdownMenu align="end">
    <template #trigger>
      <Button :variant="variant" :size="size">
        <Check v-if="copied" class="h-3.5 w-3.5" />
        <Copy v-else class="h-3.5 w-3.5" />
        <span v-if="size !== 'icon'" class="text-xs">{{ copied ? 'Copied!' : label }}</span>
        <ChevronDown class="h-3 w-3 opacity-60" />
      </Button>
    </template>
    <DropdownMenuItem
      v-for="opt in options"
      :key="opt.label"
      @select="() => selectOption(opt)"
    >
      <span class="text-xs">{{ opt.label }}</span>
    </DropdownMenuItem>
  </DropdownMenu>
</template>
