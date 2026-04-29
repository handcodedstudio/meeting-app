<script setup lang="ts">
import { computed } from 'vue';
import type { TranscribeStage } from '@shared/types/ipc';
import Progress from './ui/Progress.vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  stage: TranscribeStage;
  percent: number;
  message?: string;
}>();

const STAGES: { id: TranscribeStage; label: string }[] = [
  { id: 'load', label: 'Load model' },
  { id: 'transcribe', label: 'Transcribe' },
  { id: 'diarize', label: 'Diarize' },
  { id: 'finalize', label: 'Finalize' }
];

const currentIdx = computed(() => STAGES.findIndex((s) => s.id === props.stage));
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <div
        v-for="(s, idx) in STAGES"
        :key="s.id"
        :class="cn(
          'flex-1 text-xs px-2 py-1 rounded-md text-center transition-colors',
          idx < currentIdx ? 'bg-primary/20 text-foreground'
          : idx === currentIdx ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        )"
      >
        {{ s.label }}
      </div>
    </div>
    <Progress :value="props.percent" />
    <p v-if="message" class="text-xs text-muted-foreground">{{ message }}</p>
  </div>
</template>
