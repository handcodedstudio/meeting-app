<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { Send, X, Trash2 } from 'lucide-vue-next';
import { useChatStore } from '@/stores/chat';
import { useAnalysisStore } from '@/stores/analysis';
import { useSettingsStore } from '@/stores/settings';
import { useToast } from '@/composables/useToast';
import ChatMessage from './ChatMessage.vue';
import Button from './ui/Button.vue';
import Input from './ui/Input.vue';

const props = defineProps<{ transcriptId: string }>();

const chat = useChatStore();
const analysis = useAnalysisStore();
const settings = useSettingsStore();
const { error: errorToast } = useToast();

const draft = ref('');
const scrollEl = ref<HTMLElement | null>(null);

const entry = computed(() => chat.get(props.transcriptId));
const pending = computed(() => entry.value.pending);
const analysisDone = computed(() => analysis.get(props.transcriptId).status === 'done');

onMounted(() => {
  if (!entry.value.loaded) {
    chat.load(props.transcriptId);
  }
});

watch(
  () => entry.value.messages.length + (entry.value.pending?.partial.length ?? 0),
  async () => {
    await nextTick();
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
  }
);

async function send() {
  const text = draft.value.trim();
  if (!text || pending.value || !analysisDone.value) return;
  draft.value = '';
  try {
    await chat.send(props.transcriptId, text, settings.settings.ollamaModel);
  } catch (e) {
    errorToast('Send failed', e instanceof Error ? e.message : String(e));
  }
}

async function cancel() {
  await chat.cancel(props.transcriptId);
}

async function clear() {
  try {
    await chat.clear(props.transcriptId);
  } catch (e) {
    errorToast('Clear failed', e instanceof Error ? e.message : String(e));
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div class="shrink-0 flex items-center justify-between border-b border-border px-4 py-3">
      <h2 class="text-sm font-semibold">Chat</h2>
      <Button
        v-if="entry.messages.length > 0"
        variant="ghost"
        size="sm"
        :disabled="!!pending"
        @click="clear"
      >
        <Trash2 class="h-3.5 w-3.5" />
        <span class="text-xs">Clear</span>
      </Button>
    </div>

    <div ref="scrollEl" class="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
      <p
        v-if="!analysisDone"
        class="text-center text-xs text-muted-foreground py-8"
      >
        Run analysis to enable chat.
      </p>
      <p
        v-else-if="entry.messages.length === 0 && !pending"
        class="text-center text-xs text-muted-foreground py-8"
      >
        Ask anything about this transcript.
      </p>
      <ChatMessage v-for="msg in entry.messages" :key="msg.id" :message="msg" />
      <ChatMessage
        v-if="pending"
        role="assistant"
        :content="pending.partial"
        :pending="!pending.partial"
      />
      <p v-if="entry.lastError" class="text-xs text-destructive">{{ entry.lastError }}</p>
    </div>

    <form class="shrink-0 border-t border-border p-3 flex gap-2" @submit.prevent="send">
      <Input
        v-model="draft"
        :placeholder="analysisDone ? 'Ask a question…' : 'Run analysis to enable chat'"
        :disabled="!!pending || !analysisDone"
        class="flex-1"
        @keydown="onKeydown"
      />
      <Button v-if="pending" type="button" variant="outline" @click="cancel">
        <X class="h-4 w-4" />
      </Button>
      <Button v-else type="submit" :disabled="!draft.trim() || !analysisDone">
        <Send class="h-4 w-4" />
      </Button>
    </form>
  </section>
</template>
