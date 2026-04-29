<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Transcript } from '@shared/types/transcript';
import SpeakerTurn from './SpeakerTurn.vue';
import CopyMenu from './CopyMenu.vue';
import Button from './ui/Button.vue';
import Input from './ui/Input.vue';
import { Play, Pause, ChevronUp, ChevronDown, X } from 'lucide-vue-next';
import { useAudioPlayerStore } from '@/stores/audioPlayer';
import { mergeAdjacentTurnsBySpeaker } from '@/lib/merge';
import { formatDuration } from '@/lib/time';
import {
  asPlainText,
  asMarkdown,
  asJson,
  asTimestampsOnly
} from '@/lib/transcriptFormats';

const props = defineProps<{ transcript: Transcript }>();

const player = useAudioPlayerStore();

const turns = computed(() => mergeAdjacentTurnsBySpeaker(props.transcript.turns));

const isThisActive = computed(() => player.transcriptId === props.transcript.id);
const isThisPlaying = computed(() => isThisActive.value && player.playing);
const playheadSec = computed(() => (isThisActive.value ? player.currentTime : 0));

const query = ref('');
const activeMatch = ref(0);
const flashMatch = ref<number | null>(null);

const matches = computed<number[]>(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  const result: number[] = [];
  turns.value.forEach((t, idx) => {
    const text = t.text.toLowerCase();
    let from = 0;
    while (from < text.length) {
      const hit = text.indexOf(q, from);
      if (hit === -1) break;
      result.push(idx);
      from = hit + q.length;
    }
  });
  return result;
});

const turnEls = new Map<number, HTMLElement>();

function setTurnEl(idx: number, el: Element | null): void {
  if (el instanceof HTMLElement) {
    turnEls.set(idx, el);
  } else {
    turnEls.delete(idx);
  }
}

function scrollToTurn(idx: number): void {
  const el = turnEls.get(idx);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function gotoMatch(delta: number): void {
  if (matches.value.length === 0) return;
  const len = matches.value.length;
  activeMatch.value = (activeMatch.value + delta + len) % len;
  const idx = matches.value[activeMatch.value];
  if (typeof idx === 'number') scrollToTurn(idx);
}

function nextMatch(): void {
  gotoMatch(1);
}

function prevMatch(): void {
  gotoMatch(-1);
}

function clearQuery(): void {
  query.value = '';
  activeMatch.value = 0;
}

function onQueryUpdate(v: string): void {
  query.value = v;
  activeMatch.value = 0;
}

function onSeek(e: Event): void {
  const target = e.target as HTMLInputElement;
  player.seek(Number(target.value));
}

function onRateChange(e: Event): void {
  const target = e.target as HTMLSelectElement;
  player.setPlaybackRate(Number(target.value));
}

const copyOptions = computed(() => [
  { label: 'Plain text', value: asPlainText(turns.value) },
  { label: 'Markdown', value: asMarkdown(turns.value) },
  { label: 'JSON', value: asJson(turns.value) },
  { label: 'Timestamps only', value: asTimestampsOnly(turns.value) }
]);

function togglePlay(): void {
  player.toggle(props.transcript.id);
}

function jumpToSourceTurn(sourceTurnIndex: number): void {
  const source = props.transcript.turns[sourceTurnIndex];
  if (!source) return;
  const targetStart = source.start;
  if (typeof targetStart !== 'number') return;
  const merged = turns.value;
  let idx = merged.findIndex(
    (mt) => mt.start <= targetStart && targetStart < mt.end
  );
  if (idx === -1) {
    let bestIdx = -1;
    let bestStart = -Infinity;
    merged.forEach((mt, i) => {
      if (mt.start <= targetStart && mt.start > bestStart) {
        bestStart = mt.start;
        bestIdx = i;
      }
    });
    idx = bestIdx;
  }
  if (idx === -1) return;
  scrollToTurn(idx);
  flashMatch.value = idx;
  setTimeout(() => {
    if (flashMatch.value === idx) flashMatch.value = null;
  }, 1500);
}

defineExpose({ jumpToSourceTurn });
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div class="shrink-0 border-b border-border px-4 py-3">
      <h2 class="text-sm font-semibold">Transcript</h2>
    </div>
    <div class="shrink-0 border-b border-border px-4 py-2 space-y-2 min-w-0">
      <div class="flex items-center gap-2 min-w-0">
        <Button
          variant="outline"
          size="icon"
          :aria-label="isThisPlaying ? 'Pause audio' : 'Play audio'"
          @click="togglePlay"
        >
          <Pause v-if="isThisPlaying" class="h-4 w-4" />
          <Play v-else class="h-4 w-4" />
        </Button>
        <span class="text-xs text-muted-foreground tabular-nums shrink-0">
          {{ formatDuration(playheadSec) }}
        </span>
        <input
          type="range"
          min="0"
          :max="transcript.audio.durationSec"
          step="0.1"
          :value="playheadSec"
          class="flex-1 min-w-0"
          aria-label="Seek"
          @input="onSeek"
        />
        <span class="text-xs text-muted-foreground tabular-nums shrink-0">
          {{ formatDuration(transcript.audio.durationSec) }}
        </span>
        <select
          :value="player.playbackRate"
          aria-label="Playback speed"
          class="shrink-0 flex h-7 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @change="onRateChange"
        >
          <option :value="0.75">0.75&times;</option>
          <option :value="1">1&times;</option>
          <option :value="1.25">1.25&times;</option>
          <option :value="1.5">1.5&times;</option>
          <option :value="2">2&times;</option>
        </select>
      </div>
      <div class="flex items-center gap-2 min-w-0">
        <div class="relative flex items-center gap-1 flex-1 min-w-0">
          <Input
            :model-value="query"
            placeholder="Search"
            class="h-7 flex-1 min-w-0 text-xs"
            @update:model-value="onQueryUpdate"
          />
          <button
            v-if="query"
            type="button"
            class="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            @click="clearQuery"
          >
            <X class="h-3.5 w-3.5" />
          </button>
          <span
            v-if="query && matches.length === 0"
            class="shrink-0 text-xs text-muted-foreground tabular-nums"
          >
            No matches
          </span>
          <span
            v-else-if="query"
            class="shrink-0 text-xs text-muted-foreground tabular-nums"
          >
            {{ activeMatch + 1 }}/{{ matches.length }}
          </span>
          <button
            type="button"
            class="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
            :disabled="matches.length === 0"
            aria-label="Previous match"
            @click="prevMatch"
          >
            <ChevronUp class="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            class="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
            :disabled="matches.length === 0"
            aria-label="Next match"
            @click="nextMatch"
          >
            <ChevronDown class="h-3.5 w-3.5" />
          </button>
        </div>
        <CopyMenu :options="copyOptions" label="Copy" />
      </div>
    </div>
    <div class="app-scroll flex-1 min-h-0 overflow-y-scroll px-4 py-2">
      <div v-if="turns.length === 0" class="py-8 text-center text-sm text-muted-foreground">
        No turns yet.
      </div>
      <SpeakerTurn
        v-for="(turn, idx) in turns"
        :ref="(el) => setTurnEl(idx, el as Element | null)"
        :key="idx"
        :turn="turn"
        :transcript-id="transcript.id"
        :query="query"
        :flash="flashMatch === idx"
      />
    </div>
  </section>
</template>
