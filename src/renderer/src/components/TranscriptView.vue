<script setup lang="ts">
import { computed } from 'vue';
import type { Transcript } from '@shared/types/transcript';
import SpeakerTurn from './SpeakerTurn.vue';
import CopyButton from './CopyButton.vue';
import { mergeAdjacentTurnsBySpeaker } from '@/lib/merge';
import { formatDuration, formatTimestamp } from '@/lib/time';

const props = defineProps<{ transcript: Transcript }>();

const turns = computed(() => mergeAdjacentTurnsBySpeaker(props.transcript.turns));

const plainText = computed(() =>
  turns.value
    .map((t) => `[${formatTimestamp(t.start)}] ${t.displayName}: ${t.text}`)
    .join('\n\n')
);
</script>

<template>
  <section class="flex h-full flex-col">
    <div class="flex items-center justify-between border-b border-border px-4 py-3">
      <div class="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{{ formatDuration(transcript.audio.durationSec) }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ transcript.stats.speakerCount }} speakers</span>
        <span aria-hidden="true">·</span>
        <span>{{ transcript.stats.wordCount.toLocaleString() }} words</span>
      </div>
      <CopyButton :text="plainText" label="Copy transcript" />
    </div>
    <div class="flex-1 overflow-y-auto px-4 py-2">
      <div v-if="turns.length === 0" class="py-8 text-center text-sm text-muted-foreground">
        No turns yet.
      </div>
      <SpeakerTurn v-for="(turn, idx) in turns" :key="idx" :turn="turn" />
    </div>
  </section>
</template>
