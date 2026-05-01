<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Analysis, Minutes } from '@shared/types/analysis';
import type { AnalysisEntry } from '@/stores/analysis';
import type { MinutesEntry } from '@/stores/minutes';
import Tabs from './ui/Tabs.vue';
import Button from './ui/Button.vue';
import CopyMenu from './CopyMenu.vue';
import ChatPanel from './ChatPanel.vue';
import OllamaSetupBanner from './OllamaSetupBanner.vue';
import {
  ListChecks,
  Gavel,
  CalendarClock,
  HelpCircle,
  FileText,
  MessageSquare,
  Download,
  Loader2
} from 'lucide-vue-next';

const props = defineProps<{
  transcriptId: string;
  transcriptTitle?: string;
  analysisEntry: AnalysisEntry;
  minutesEntry: MinutesEntry;
}>();

const emit = defineEmits<{
  (e: 'jump', sourceTurnIndex: number): void;
  (e: 'retryAnalysis'): void;
}>();

const analysisStatus = computed(() => props.analysisEntry.status);
const minutesStatus = computed(() => props.minutesEntry.status);
const analysisRunning = computed(() => analysisStatus.value === 'running');
const minutesBusy = computed(() => minutesStatus.value === 'running');
const analysisIdle = computed(() => analysisStatus.value === 'idle');
const analysisError = computed(() => analysisStatus.value === 'error');
const minutesError = computed(() => minutesStatus.value === 'error');

const minutes = computed<Minutes | undefined>(() => props.minutesEntry.data);
const hasMinutesContent = computed(
  () => !!minutes.value && minutes.value.content.length > 0
);

type TabId =
  | 'actionItems'
  | 'decisions'
  | 'keyDates'
  | 'openQuestions'
  | 'minutes'
  | 'chat';

interface ListItem {
  id: string;
  description: string;
  meta?: string;
  sourceTurnIndex?: number;
}

interface ListSection {
  id: TabId;
  label: string;
  icon: typeof ListChecks;
  items: ListItem[];
  emptyHint: string;
}

const analysis = computed<Analysis | undefined>(() => props.analysisEntry.data);

const sections = computed<ListSection[]>(() => {
  const a = analysis.value;
  return [
    {
      id: 'actionItems',
      label: 'Action items',
      icon: ListChecks,
      emptyHint: 'No action items detected.',
      items: (a?.actionItems ?? []).map((it) => {
        const item: ListItem = { id: it.id, description: it.description };
        const meta = [it.assignee, it.dueDate].filter(Boolean).join(' · ');
        if (meta) item.meta = meta;
        if (it.sourceTurnIndex !== undefined) item.sourceTurnIndex = it.sourceTurnIndex;
        return item;
      })
    },
    {
      id: 'decisions',
      label: 'Decisions',
      icon: Gavel,
      emptyHint: 'No decisions detected.',
      items: (a?.decisions ?? []).map((it) => {
        const item: ListItem = { id: it.id, description: it.description };
        if (it.sourceTurnIndex !== undefined) item.sourceTurnIndex = it.sourceTurnIndex;
        return item;
      })
    },
    {
      id: 'keyDates',
      label: 'Key dates',
      icon: CalendarClock,
      emptyHint: 'No dates detected.',
      items: (a?.keyDates ?? []).map((it) => {
        const item: ListItem = { id: it.id, description: it.description };
        if (it.date) item.meta = it.date;
        if (it.sourceTurnIndex !== undefined) item.sourceTurnIndex = it.sourceTurnIndex;
        return item;
      })
    },
    {
      id: 'openQuestions',
      label: 'Open questions',
      icon: HelpCircle,
      emptyHint: 'No open questions detected.',
      items: (a?.openQuestions ?? []).map((it) => {
        const item: ListItem = { id: it.id, description: it.description };
        if (it.sourceTurnIndex !== undefined) item.sourceTurnIndex = it.sourceTurnIndex;
        return item;
      })
    }
  ];
});

const activeTab = ref<TabId>('chat');

const tabs = computed(() => [
  {
    value: 'chat' as TabId,
    label: 'Chat'
  },
  ...sections.value.map((s) => ({
    value: s.id,
    label: s.label,
    count: analysis.value ? s.items.length : undefined
  })),
  {
    value: 'minutes' as TabId,
    label: 'Minutes',
    count: props.minutesEntry.data ? 1 : undefined
  }
]);

const validIds: TabId[] = [
  'chat',
  'actionItems',
  'decisions',
  'keyDates',
  'openQuestions',
  'minutes'
];

watch(activeTab, (val) => {
  if (!validIds.includes(val)) activeTab.value = 'chat';
});

const activeSection = computed(() =>
  sections.value.find((s) => s.id === activeTab.value)
);

const isChatTab = computed(() => activeTab.value === 'chat');
const isMinutesTab = computed(() => activeTab.value === 'minutes');

const activeSectionCopyOptions = computed(() => {
  const s = activeSection.value;
  if (!s) return [];
  return [
    { label: 'Markdown', value: sectionMarkdown(s) },
    { label: 'JSON', value: sectionJson(s) }
  ];
});

const minutesCopyOptions = computed(() => {
  const m = minutes.value;
  if (!m) return [];
  return [{ label: 'Markdown', value: m.content }];
});

function sectionMarkdown(section: ListSection): string {
  if (section.items.length === 0) return `## ${section.label}\n\n_${section.emptyHint}_`;
  const lines = section.items.map((it) => {
    const meta = it.meta ? ` _(${it.meta})_` : '';
    return `- ${it.description}${meta}`;
  });
  return `## ${section.label}\n\n${lines.join('\n')}`;
}

function sectionJson(section: ListSection): string {
  return JSON.stringify(
    section.items.map((i) => ({
      description: i.description,
      meta: i.meta,
      sourceTurnIndex: i.sourceTurnIndex
    })),
    null,
    2
  );
}

function safeFilename(base: string): string {
  return base.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'minutes';
}

function downloadMinutes(minutes: Minutes) {
  const title = safeFilename(props.transcriptTitle ?? 'minutes');
  const blob = new Blob([minutes.content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}-minutes.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
</script>

<template>
  <Tabs
    v-model="activeTab"
    :tabs="tabs"
    class="h-full"
  >
    <!-- Chat tab fills its container; others live inside a scrollable wrapper. -->
    <div
      v-if="isChatTab"
      class="h-full"
    >
      <ChatPanel :transcript-id="transcriptId" />
    </div>

    <div
      v-else
      class="h-full overflow-y-auto p-4"
    >
      <!-- Analysis sections (action items, decisions, key dates, open questions) -->
      <template v-if="activeSection">
        <div class="flex items-center justify-between gap-2 mb-3">
          <h3 class="flex items-center gap-2 text-sm font-semibold">
            <component
              :is="activeSection.icon"
              class="h-4 w-4 text-muted-foreground"
            />
            {{ activeSection.label }}
            <span
              v-if="analysis"
              class="text-xs font-normal text-muted-foreground"
            >
              ({{ activeSection.items.length }})
            </span>
          </h3>
          <CopyMenu
            v-if="analysis"
            :options="activeSectionCopyOptions"
          />
        </div>

        <OllamaSetupBanner
          v-if="!analysis"
          class="mb-3"
        />

        <div
          v-if="!analysis && analysisIdle"
          class="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
        >
          Click Analyze to extract action items, decisions, key dates, open questions, and minutes.
        </div>
        <div
          v-else-if="!analysis && analysisRunning"
          class="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2 class="h-3.5 w-3.5 animate-spin" />
          Analyzing…
        </div>
        <div
          v-else-if="!analysis && analysisError"
          class="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm space-y-2"
        >
          <p class="font-medium">
            Analysis failed
          </p>
          <p class="text-xs text-muted-foreground">
            {{ analysisEntry.error }}
          </p>
          <Button
            size="sm"
            variant="outline"
            @click="emit('retryAnalysis')"
          >
            Retry
          </Button>
        </div>
        <p
          v-else-if="activeSection.items.length === 0"
          class="text-xs text-muted-foreground italic"
        >
          {{ activeSection.emptyHint }}
        </p>
        <ul
          v-else
          class="space-y-1.5 text-sm"
        >
          <template
            v-for="item in activeSection.items"
            :key="item.id"
          >
            <li v-if="item.sourceTurnIndex !== undefined">
              <button
                type="button"
                class="flex flex-col w-full text-left cursor-pointer hover:bg-muted/50 rounded-sm px-2 -mx-2 transition-colors"
                @click="emit('jump', item.sourceTurnIndex)"
              >
                <span>{{ item.description }}</span>
                <span
                  v-if="item.meta"
                  class="text-xs text-muted-foreground"
                >{{ item.meta }}</span>
              </button>
            </li>
            <li
              v-else
              class="flex flex-col"
            >
              <span>{{ item.description }}</span>
              <span
                v-if="item.meta"
                class="text-xs text-muted-foreground"
              >{{ item.meta }}</span>
            </li>
          </template>
        </ul>
      </template>

      <!-- Minutes tab -->
      <template v-else-if="isMinutesTab">
        <div class="flex items-center justify-between gap-2 mb-3">
          <h3 class="flex items-center gap-2 text-sm font-semibold">
            <FileText class="h-4 w-4 text-muted-foreground" />
            Minutes
          </h3>
          <div
            v-if="hasMinutesContent && minutes"
            class="flex items-center gap-1"
          >
            <CopyMenu
              :options="minutesCopyOptions"
              label="Copy"
            />
            <Button
              variant="ghost"
              size="sm"
              @click="downloadMinutes(minutes)"
            >
              <Download class="h-3.5 w-3.5" />
              <span class="text-xs">Download</span>
            </Button>
          </div>
        </div>

        <OllamaSetupBanner
          v-if="!minutes"
          class="mb-3"
        />

        <div
          v-if="minutesError"
          class="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm space-y-2 mb-3"
        >
          <p class="font-medium">
            Minutes generation failed
          </p>
          <p class="text-xs text-muted-foreground">
            {{ minutesEntry.error }}
          </p>
        </div>

        <div
          v-if="minutesBusy"
          class="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2 class="h-3.5 w-3.5 animate-spin" />
          Generating minutes…
        </div>
        <div
          v-else-if="hasMinutesContent && minutes"
          class="rounded-md border border-border bg-muted/30 p-4"
        >
          <pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed">{{ minutes.content }}</pre>
        </div>
        <p
          v-else-if="!minutesError"
          class="text-xs text-muted-foreground italic"
        >
          Minutes are drafted from your saved sample format whenever you click <span class="font-medium">Analyze</span>.
        </p>
      </template>

      <!-- Fallback (shouldn't normally render — chat tab handled above) -->
      <template v-else>
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <MessageSquare class="h-3.5 w-3.5" />
          Loading…
        </div>
      </template>
    </div>
  </Tabs>
</template>
