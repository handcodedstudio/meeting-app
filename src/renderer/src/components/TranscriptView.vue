<script setup lang="ts">
import { computed } from 'vue';
import type { Transcript } from '@shared/types/transcript';
import SpeakerTurn from './SpeakerTurn.vue';
import CopyButton from './CopyButton.vue';
import Button from './ui/Button.vue';
import { Play, Pause } from 'lucide-vue-next';
import { useAudioPlayerStore } from '@/stores/audioPlayer';
import { mergeAdjacentTurnsBySpeaker } from '@/lib/merge';
import { formatDuration, formatTimestamp } from '@/lib/time';

const props = defineProps<{ transcript: Transcript }>();

const player = useAudioPlayerStore();

const turns = computed(() => mergeAdjacentTurnsBySpeaker(props.transcript.turns));

const isThisActive = computed(() => player.transcriptId === props.transcript.id);
const isThisPlaying = computed(() => isThisActive.value && player.playing);
const playheadSec = computed(() => (isThisActive.value ? player.currentTime : 0));

const plainText = computed(() =>
  turns.value
    .map((t) => `[${formatTimestamp(t.start)}] ${t.displayName}: ${t.text}`)
    .join('\n\n')
);

function togglePlay(): void {
  player.toggle(props.transcript.id);
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div class="shrink-0 border-b border-border px-4 py-3">
      <h2 class="text-sm font-semibold">Transcript</h2>
    </div>
    <div class="shrink-0 flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div class="flex items-center gap-3 min-w-0">
        <Button
          variant="outline"
          size="icon"
          :aria-label="isThisPlaying ? 'Pause audio' : 'Play audio'"
          @click="togglePlay"
        >
          <Pause v-if="isThisPlaying" class="h-4 w-4" />
          <Play v-else class="h-4 w-4" />
        </Button>
        <div class="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
          <span>{{ formatDuration(playheadSec) }}</span>
          <span aria-hidden="true">/</span>
          <span>{{ formatDuration(transcript.audio.durationSec) }}</span>
        </div>
        <span aria-hidden="true" class="text-xs text-muted-foreground">·</span>
        <div class="flex items-center gap-3 text-xs text-muted-foreground truncate">
          <span>{{ transcript.stats.speakerCount }} speakers</span>
          <span aria-hidden="true">·</span>
          <span>{{ transcript.stats.wordCount.toLocaleString() }} words</span>
        </div>
      </div>
      <CopyButton :text="plainText" label="Copy" />
    </div>
    <div class="app-scroll flex-1 min-h-0 overflow-y-scroll px-4 py-2">
      <div v-if="turns.length === 0" class="py-8 text-center text-sm text-muted-foreground">
        No turns yet.
      </div>
      <SpeakerTurn
        v-for="(turn, idx) in turns"
        :key="idx"
        :turn="turn"
        :transcript-id="transcript.id"
      />
    </div>
  </section>
</template>
