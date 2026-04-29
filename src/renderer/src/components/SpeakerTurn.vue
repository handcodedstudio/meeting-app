<script setup lang="ts">
import type { SpeakerTurn } from '@shared/types/transcript';
import SpeakerRenameInput from './SpeakerRenameInput.vue';
import { Play } from 'lucide-vue-next';
import { useAudioPlayerStore } from '@/stores/audioPlayer';
import { formatTimestamp } from '@/lib/time';

const props = defineProps<{ turn: SpeakerTurn; transcriptId: string }>();

const player = useAudioPlayerStore();

function playFromHere(): void {
  player.seekAndPlay(props.transcriptId, props.turn.start);
}
</script>

<template>
  <div class="group flex gap-3 py-3">
    <div class="w-20 shrink-0 pt-0.5 flex items-center justify-end gap-1">
      <button
        type="button"
        class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        :aria-label="`Play from ${formatTimestamp(turn.start)}`"
        @click="playFromHere"
      >
        <Play class="h-3 w-3" />
      </button>
      <button
        type="button"
        class="font-mono text-xs text-muted-foreground hover:text-foreground"
        :aria-label="`Play from ${formatTimestamp(turn.start)}`"
        @click="playFromHere"
      >
        [{{ formatTimestamp(turn.start) }}]
      </button>
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
