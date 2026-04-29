<script setup lang="ts">
import { computed } from 'vue';
import type { Analysis } from '@shared/types/analysis';
import Card from './ui/Card.vue';
import CardHeader from './ui/CardHeader.vue';
import CardTitle from './ui/CardTitle.vue';
import CardContent from './ui/CardContent.vue';
import CopyMenu from './CopyMenu.vue';
import { ListChecks, Gavel, CalendarClock, HelpCircle } from 'lucide-vue-next';

const props = defineProps<{ analysis: Analysis }>();
const emit = defineEmits<{ (e: 'jump', sourceTurnIndex: number): void }>();

interface ListItem {
  id: string;
  description: string;
  meta?: string;
  sourceTurnIndex?: number;
}

interface Section {
  title: string;
  icon: typeof ListChecks;
  items: ListItem[];
  emptyHint: string;
}

const sections = computed<Section[]>(() => [
  {
    title: 'Action items',
    icon: ListChecks,
    emptyHint: 'No action items detected.',
    items: props.analysis.actionItems.map((a) => ({
      id: a.id,
      description: a.description,
      meta: [a.assignee, a.dueDate].filter(Boolean).join(' · ') || undefined,
      sourceTurnIndex: a.sourceTurnIndex
    }))
  },
  {
    title: 'Decisions',
    icon: Gavel,
    emptyHint: 'No decisions detected.',
    items: props.analysis.decisions.map((d) => ({
      id: d.id,
      description: d.description,
      sourceTurnIndex: d.sourceTurnIndex
    }))
  },
  {
    title: 'Key dates',
    icon: CalendarClock,
    emptyHint: 'No dates detected.',
    items: props.analysis.keyDates.map((k) => ({
      id: k.id,
      description: k.description,
      meta: k.date,
      sourceTurnIndex: k.sourceTurnIndex
    }))
  },
  {
    title: 'Open questions',
    icon: HelpCircle,
    emptyHint: 'No open questions detected.',
    items: props.analysis.openQuestions.map((q) => ({
      id: q.id,
      description: q.description,
      sourceTurnIndex: q.sourceTurnIndex
    }))
  }
]);

function sectionMarkdown(section: Section): string {
  if (section.items.length === 0) return `## ${section.title}\n\n_${section.emptyHint}_`;
  const lines = section.items.map((it) => {
    const meta = it.meta ? ` _(${it.meta})_` : '';
    return `- ${it.description}${meta}`;
  });
  return `## ${section.title}\n\n${lines.join('\n')}`;
}

function sectionJson(section: Section): string {
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
</script>

<template>
  <div class="flex flex-col gap-4">
    <Card v-for="section in sections" :key="section.title">
      <CardHeader class="flex flex-row items-center justify-between gap-2">
        <CardTitle class="flex items-center gap-2">
          <component :is="section.icon" class="h-4 w-4 text-muted-foreground" />
          {{ section.title }}
          <span class="text-xs font-normal text-muted-foreground">
            ({{ section.items.length }})
          </span>
        </CardTitle>
        <CopyMenu
          :options="[
            { label: 'Markdown', value: sectionMarkdown(section) },
            { label: 'JSON', value: sectionJson(section) }
          ]"
        />
      </CardHeader>
      <CardContent>
        <p v-if="section.items.length === 0" class="text-xs text-muted-foreground italic">
          {{ section.emptyHint }}
        </p>
        <ul v-else class="space-y-1.5 text-sm">
          <template v-for="item in section.items" :key="item.id">
            <li v-if="item.sourceTurnIndex !== undefined">
              <button
                type="button"
                class="flex flex-col w-full text-left cursor-pointer hover:bg-muted/50 rounded-sm px-2 -mx-2 transition-colors"
                @click="emit('jump', item.sourceTurnIndex)"
              >
                <span>{{ item.description }}</span>
                <span v-if="item.meta" class="text-xs text-muted-foreground">{{ item.meta }}</span>
              </button>
            </li>
            <li v-else class="flex flex-col">
              <span>{{ item.description }}</span>
              <span v-if="item.meta" class="text-xs text-muted-foreground">{{ item.meta }}</span>
            </li>
          </template>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>
