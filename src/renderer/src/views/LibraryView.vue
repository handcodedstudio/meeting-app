<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useTranscriptsStore } from '@/stores/transcripts';
import { useActiveTranscriptStore } from '@/stores/activeTranscript';
import { useSystemStore } from '@/stores/system';
import { useSettingsStore } from '@/stores/settings';
import { useToast } from '@/composables/useToast';
import UploadDropzone from '@/components/UploadDropzone.vue';
import LibraryList from '@/components/LibraryList.vue';
import ProgressStages from '@/components/ProgressStages.vue';
import OllamaSetupBanner from '@/components/OllamaSetupBanner.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import { X } from 'lucide-vue-next';

const router = useRouter();
const transcripts = useTranscriptsStore();
const active = useActiveTranscriptStore();
const system = useSystemStore();
const settings = useSettingsStore();
const { error: errorToast, success } = useToast();

const transcribing = computed(() => !!active.transcribingId && active.progress);

const query = ref('');

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (q === '') return transcripts.summaries;
  return transcripts.summaries.filter((s) => s.title.toLowerCase().includes(q));
});

onMounted(async () => {
  await Promise.allSettled([
    transcripts.refresh(),
    settings.load(),
    system.pollAll()
  ]);
});

async function handleFile(filePath: string) {
  const id = await active.startTranscribe(filePath);
  if (!id) {
    errorToast('Could not start transcription', active.error ?? 'Unknown error');
    return;
  }
  success('Transcription started');
}

// Navigate to the new transcript once both: (a) the transcript is loaded and
// (b) the transcribingId has cleared. Watching just `.id` missed the trailing
// edge when the ids matched but `transcribingId` was still set.
watch(
  () => [active.transcript?.id, active.transcribingId] as const,
  ([id, busyId]) => {
    if (id && busyId === null) {
      transcripts.refresh();
      router.push({ name: 'transcript', params: { id } });
    }
  }
);

function cancel() {
  active.cancelTranscribe();
}
</script>

<template>
  <section class="h-full overflow-y-auto px-6 py-6">
    <div class="mx-auto max-w-4xl space-y-6">
      <OllamaSetupBanner />

      <UploadDropzone :disabled="!!active.transcribingId" @file="handleFile" />

      <div
        v-if="transcribing && active.progress"
        class="rounded-lg border border-border bg-card p-4 space-y-3"
      >
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium">Transcribing…</p>
          <Button variant="ghost" size="sm" @click="cancel">
            <X class="h-3.5 w-3.5" />
            <span class="text-xs">Cancel</span>
          </Button>
        </div>
        <ProgressStages
          :stage="active.progress.stage"
          :percent="active.progress.percent"
          :message="active.progress.message"
        />
      </div>

      <div
        v-if="active.error && !active.transcribingId"
        class="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm"
      >
        {{ active.error }}
      </div>

      <div>
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold">Transcripts</h2>
          <Input
            v-model="query"
            placeholder="Search transcripts…"
            class="max-w-xs"
          />
        </div>
        <div
          v-if="transcripts.loading && transcripts.summaries.length === 0"
          class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
        >
          Loading…
        </div>
        <div
          v-else-if="transcripts.summaries.length === 0"
          class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
        >
          No transcripts yet — drop an audio file above.
        </div>
        <div
          v-else-if="filtered.length === 0"
          class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
        >
          {{ `No transcripts match \`${query}\`.` }}
        </div>
        <LibraryList v-else :summaries="filtered" />
      </div>
    </div>
  </section>
</template>
