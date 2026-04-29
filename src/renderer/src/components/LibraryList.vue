<script setup lang="ts">
import { useRouter } from 'vue-router';
import { Trash2, FileAudio } from 'lucide-vue-next';
import type { TranscriptSummary } from '@shared/types/transcript';
import { formatDate, formatDuration } from '@/lib/time';
import { useTranscriptsStore } from '@/stores/transcripts';
import { useToast } from '@/composables/useToast';
import Button from './ui/Button.vue';

defineProps<{ summaries: TranscriptSummary[] }>();

const router = useRouter();
const transcripts = useTranscriptsStore();
const { error: errorToast } = useToast();

function open(id: string) {
  router.push({ name: 'transcript', params: { id } });
}

async function remove(id: string, ev: Event) {
  ev.stopPropagation();
  try {
    await transcripts.remove(id);
  } catch (e) {
    errorToast('Delete failed', e instanceof Error ? e.message : String(e));
  }
}
</script>

<template>
  <ul class="divide-y divide-border rounded-lg border border-border bg-card">
    <li
      v-for="s in summaries"
      :key="s.id"
      class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
      @click="open(s.id)"
    >
      <FileAudio class="h-4 w-4 text-muted-foreground shrink-0" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">{{ s.title || 'Untitled' }}</p>
        <p class="text-xs text-muted-foreground">
          {{ formatDate(s.createdAt) }} · {{ formatDuration(s.durationSec) }} ·
          {{ s.speakerCount }} speakers
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete transcript"
        @click="(e: Event) => remove(s.id, e)"
      >
        <Trash2 class="h-4 w-4 text-muted-foreground" />
      </Button>
    </li>
  </ul>
</template>
