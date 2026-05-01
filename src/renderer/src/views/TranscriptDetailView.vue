<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed, watch } from 'vue';
import { useActiveTranscriptStore } from '@/stores/activeTranscript';
import { useAnalysisStore } from '@/stores/analysis';
import { useMinutesStore } from '@/stores/minutes';
import { useChatStore } from '@/stores/chat';
import { useSystemStore } from '@/stores/system';
import { useSettingsStore } from '@/stores/settings';
import { useTranscriptsStore } from '@/stores/transcripts';
import { useAudioPlayerStore } from '@/stores/audioPlayer';
import { useToast } from '@/composables/useToast';
import TranscriptView from '@/components/TranscriptView.vue';
import AnalysisTabs from '@/components/AnalysisTabs.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import { Sparkles, Loader2, ArrowLeft, Pencil } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { formatDuration } from '@/lib/time';

const props = defineProps<{ id: string }>();

const router = useRouter();
const active = useActiveTranscriptStore();
const analysis = useAnalysisStore();
const minutes = useMinutesStore();
const chat = useChatStore();
const system = useSystemStore();
const settings = useSettingsStore();
const transcripts = useTranscriptsStore();
const audioPlayer = useAudioPlayerStore();
const { error: errorToast, success } = useToast();

type Tab = 'transcript' | 'summary';
const activeTab = ref<Tab>('transcript');

type TranscriptViewExposed = InstanceType<typeof TranscriptView> & {
  jumpToSourceTurn?: (idx: number) => void;
};
const transcriptViewDesktop = ref<TranscriptViewExposed | null>(null);
const transcriptViewMobile = ref<TranscriptViewExposed | null>(null);

function onJump(sourceTurnIndex: number) {
  const target = transcriptViewDesktop.value ?? transcriptViewMobile.value;
  target?.jumpToSourceTurn?.(sourceTurnIndex);
  activeTab.value = 'transcript';
}

const editingTitle = ref(false);
const titleDraft = ref('');

const transcript = computed(() => active.transcript);
const analysisEntry = computed(() => analysis.get(props.id));
const minutesEntry = computed(() => minutes.get(props.id));

const ollamaReady = computed(
  () => system.ollama.running && system.ollama.models.includes(settings.settings.ollamaModel)
);

async function loadAll() {
  active.clear();
  await active.load(props.id);
  try {
    const res = await window.api.transcriptsLoad({ id: props.id });
    analysis.setInitial(props.id, res.analysis);
    minutes.setInitial(props.id, res.minutes);
    chat.loadInitial(props.id, res.chat);
  } catch {
    // active.load already surfaces an error message
  }
}

onMounted(async () => {
  await Promise.allSettled([settings.load(), system.pollAll()]);
  await loadAll();
});

watch(
  () => props.id,
  () => {
    audioPlayer.reset();
    loadAll();
  }
);

watch(
  () => audioPlayer.error,
  (msg) => {
    if (msg) errorToast('Audio playback failed', msg);
  }
);

onBeforeUnmount(() => {
  audioPlayer.reset();
});

async function runAnalysis() {
  if (!ollamaReady.value) {
    errorToast('Ollama not ready', 'Start Ollama and pull the configured model first.');
    return;
  }
  const model = settings.settings.ollamaModel;
  await Promise.all([analysis.run(props.id, model), minutes.run(props.id, model)]);
  const analysisFailed = analysisEntry.value.status === 'error';
  const minutesFailed = minutesEntry.value.status === 'error';
  if (analysisFailed && minutesFailed) {
    errorToast('Analyze failed', analysisEntry.value.error ?? minutesEntry.value.error ?? 'Unknown error');
  } else if (analysisFailed) {
    errorToast('Analysis failed', analysisEntry.value.error ?? 'Unknown error');
  } else if (minutesFailed) {
    errorToast('Minutes failed', minutesEntry.value.error ?? 'Unknown error');
  } else {
    success('Analysis complete');
  }
}

async function runMinutesOnly() {
  if (!ollamaReady.value) {
    errorToast('Ollama not ready', 'Start Ollama and pull the configured model first.');
    return;
  }
  await minutes.run(props.id, settings.settings.ollamaModel);
  if (minutesEntry.value.status === 'error') {
    errorToast('Minutes failed', minutesEntry.value.error ?? 'Unknown error');
  }
}

function startTitleEdit() {
  if (!transcript.value) return;
  titleDraft.value = transcript.value.title;
  editingTitle.value = true;
}

async function commitTitle() {
  if (!transcript.value) return;
  const next = titleDraft.value.trim();
  if (!next || next === transcript.value.title) {
    editingTitle.value = false;
    return;
  }
  try {
    await transcripts.rename(transcript.value.id, next);
    if (transcript.value) {
      active.transcript = { ...transcript.value, title: next };
    }
    editingTitle.value = false;
  } catch (e) {
    errorToast('Rename failed', e instanceof Error ? e.message : String(e));
  }
}

function back() {
  router.push({ name: 'library' });
}
</script>

<template>
  <section class="flex h-full flex-col">
    <header class="border-b border-border px-4 py-3 flex items-center gap-3">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Back"
        @click="back"
      >
        <ArrowLeft class="h-4 w-4" />
      </Button>
      <div class="flex-1 min-w-0">
        <div
          v-if="editingTitle"
          class="flex items-center gap-2"
        >
          <Input
            v-model="titleDraft"
            class="max-w-sm"
            @blur="commitTitle"
            @keydown.enter="commitTitle"
            @keydown.escape="editingTitle = false"
          />
        </div>
        <div
          v-else-if="transcript"
          class="flex items-center gap-2 min-w-0"
        >
          <h1 class="text-sm font-semibold truncate">{{ transcript.title }}</h1>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground"
            aria-label="Rename"
            @click="startTitleEdit"
          >
            <Pencil class="h-3 w-3" />
          </button>
        </div>
        <p
          v-if="transcript"
          class="text-xs text-muted-foreground"
        >
          {{ formatDuration(transcript.audio.durationSec) }} ·
          {{ transcript.stats.speakerCount }} speakers ·
          {{ transcript.stats.wordCount.toLocaleString() }} words
        </p>
      </div>
      <Button
        :disabled="
          !transcript ||
            analysisEntry.status === 'running' ||
            minutesEntry.status === 'running' ||
            !ollamaReady
        "
        size="sm"
        @click="runAnalysis"
      >
        <Loader2
          v-if="analysisEntry.status === 'running' || minutesEntry.status === 'running'"
          class="h-3.5 w-3.5 animate-spin"
        />
        <Sparkles
          v-else
          class="h-3.5 w-3.5"
        />
        <span class="text-xs">
          {{
            analysisEntry.status === 'running' || minutesEntry.status === 'running'
              ? 'Analyzing…'
              : analysisEntry.status === 'done' || minutesEntry.status === 'done'
                ? 'Re-analyze'
                : 'Analyze'
          }}
        </span>
      </Button>
    </header>

    <div class="border-b border-border px-4 pt-2 lg:hidden">
      <div class="flex gap-1 text-xs">
        <button
          v-for="t in (['transcript', 'summary'] as Tab[])"
          :key="t"
          type="button"
          class="px-3 py-1.5 rounded-t-md capitalize"
          :class="activeTab === t ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = t"
        >
          {{ t }}
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-hidden">
      <div
        v-if="active.loadingId === props.id"
        class="h-full flex items-center justify-center text-sm text-muted-foreground"
      >
        Loading transcript…
      </div>
      <div
        v-else-if="!transcript"
        class="h-full flex items-center justify-center text-sm text-muted-foreground"
      >
        Transcript not found.
      </div>
      <div
        v-else
        class="h-full min-h-0"
      >
        <div class="hidden lg:grid lg:grid-cols-2 h-full min-h-0">
          <TranscriptView
            ref="transcriptViewDesktop"
            :transcript="transcript"
            class="border-r border-border min-h-0"
          />
          <section class="flex h-full min-h-0 flex-col">
            <div class="shrink-0 border-b border-border px-4 py-3">
              <h2 class="text-sm font-semibold">
                Summary
              </h2>
            </div>
            <AnalysisTabs
              :transcript-id="props.id"
              :transcript-title="transcript.title"
              :analysis-entry="analysisEntry"
              :minutes-entry="minutesEntry"
              class="flex-1 min-h-0"
              @jump="onJump"
              @retry-analysis="runAnalysis"
              @retry-minutes="runMinutesOnly"
            />
          </section>
        </div>

        <div class="lg:hidden h-full">
          <div
            v-show="activeTab === 'transcript'"
            class="h-full"
          >
            <TranscriptView
              ref="transcriptViewMobile"
              :transcript="transcript"
            />
          </div>
          <div
            v-show="activeTab === 'summary'"
            class="h-full flex flex-col"
          >
            <AnalysisTabs
              :transcript-id="props.id"
              :transcript-title="transcript.title"
              :analysis-entry="analysisEntry"
              :minutes-entry="minutesEntry"
              class="flex-1 min-h-0"
              @jump="onJump"
              @retry-analysis="runAnalysis"
              @retry-minutes="runMinutesOnly"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
