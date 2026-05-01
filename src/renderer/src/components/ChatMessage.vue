<script setup lang="ts">
import type { ChatMessage } from '@shared/types/chat';
import { cn } from '@/lib/utils';
import { computed } from 'vue';

const props = defineProps<{
  message?: ChatMessage;
  role?: 'user' | 'assistant';
  content?: string;
  pending?: boolean;
  errored?: boolean;
}>();

const role = computed(() => props.message?.role ?? props.role ?? 'assistant');
const content = computed(() => props.message?.content ?? props.content ?? '');
const errored = computed(() => props.message?.errored ?? props.errored ?? false);
const isUser = computed(() => role.value === 'user');

const bubbleClass = computed(() =>
  cn(
    'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
    isUser.value
      ? 'bg-primary text-primary-foreground self-end'
      : 'bg-muted text-foreground self-start',
    errored.value && !isUser.value ? 'border border-destructive/50' : ''
  )
);
</script>

<template>
  <div :class="cn('flex w-full', isUser ? 'justify-end' : 'justify-start')">
    <div :class="bubbleClass">
      <span v-if="content">{{ content }}</span>
      <span
        v-else-if="pending"
        class="inline-flex gap-1 items-center text-muted-foreground"
      >
        <span class="animate-pulse">·</span>
        <span class="animate-pulse [animation-delay:120ms]">·</span>
        <span class="animate-pulse [animation-delay:240ms]">·</span>
      </span>
      <span
        v-else
        class="text-muted-foreground italic"
      >(empty)</span>
    </div>
  </div>
</template>
