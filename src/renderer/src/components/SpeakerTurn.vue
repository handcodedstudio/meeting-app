<script setup lang="ts">
import type { SpeakerTurn } from '@shared/types/transcript';
import SpeakerRenameInput from './SpeakerRenameInput.vue';
import { formatTimestamp } from '@/lib/time';

defineProps<{ turn: SpeakerTurn }>();
</script>

<template>
  <div class="group flex gap-3 py-3">
    <div class="w-16 shrink-0 pt-0.5 text-right">
      <span class="font-mono text-xs text-muted-foreground">
        [{{ formatTimestamp(turn.start) }}]
      </span>
    </div>
    <div class="flex-1 min-w-0 space-y-1">
      <div class="text-xs">
        <SpeakerRenameInput :speaker-id="turn.speaker" :display-name="turn.displayName" />
      </div>
      <p class="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
        {{ turn.text }}
      </p>
    </div>
  </div>
</template>
