<script setup lang="ts">
import { computed } from 'vue';
import type { SpeakerTurn } from '@shared/types/transcript';
import SpeakerRenameInput from './SpeakerRenameInput.vue';
import { Play } from 'lucide-vue-next';
import { useAudioPlayerStore } from '@/stores/audioPlayer';
import { formatTimestamp } from '@/lib/time';

const props = withDefaults(
  defineProps<{
    turn: SpeakerTurn;
    transcriptId: string;
    query?: string;
    flash?: boolean;
  }>(),
  { query: '', flash: false }
);

const player = useAudioPlayerStore();

const segments = computed<{ text: string; match: boolean }[]>(() => {
  const q = props.query.trim();
  const text = props.turn.text;
  if (!q) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const result: { text: string; match: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const found = lower.indexOf(needle, i);
    if (found === -1) {
      result.push({ text: text.slice(i), match: false });
      break;
    }
    if (found > i) {
      result.push({ text: text.slice(i, found), match: false });
    }
    result.push({ text: text.slice(found, found + needle.length), match: true });
    i = found + needle.length;
  }
  return result;
});

function playFromHere(): void {
  player.seekAndPlay(props.transcriptId, props.turn.start);
}
</script>

<template>
  <div
    class="group flex gap-3 py-3 rounded-md transition-colors"
    :class="flash ? 'bg-primary/10' : ''"
  >
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
        <SpeakerRenameInput
          :speaker-id="turn.speaker"
          :display-name="turn.displayName"
        />
      </div>
      <p class="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
        <template
          v-for="(seg, i) in segments"
          :key="i"
        >
          <mark
            v-if="seg.match"
            class="bg-yellow-200/60 dark:bg-yellow-500/30 rounded px-0.5"
          >{{ seg.text }}</mark>
          <span v-else>{{ seg.text }}</span>
        </template>
      </p>
    </div>
  </div>
</template>
