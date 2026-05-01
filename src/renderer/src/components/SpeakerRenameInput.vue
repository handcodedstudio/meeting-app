<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { Pencil, Check, X as XIcon } from 'lucide-vue-next';
import Input from './ui/Input.vue';
import Button from './ui/Button.vue';
import { useActiveTranscriptStore } from '@/stores/activeTranscript';
import { useToast } from '@/composables/useToast';

const props = defineProps<{
  speakerId: string;
  displayName: string;
}>();

const editing = ref(false);
const draft = ref(props.displayName);
const inputRef = ref<HTMLElement | null>(null);
const saving = ref(false);

const store = useActiveTranscriptStore();
const { error: errorToast } = useToast();

async function startEdit() {
  draft.value = props.displayName;
  editing.value = true;
  await nextTick();
  const el = inputRef.value as unknown as HTMLInputElement | null;
  el?.focus();
  el?.select?.();
}

function cancel() {
  editing.value = false;
  draft.value = props.displayName;
}

async function commit() {
  const next = draft.value.trim();
  if (!next || next === props.displayName) {
    cancel();
    return;
  }
  saving.value = true;
  try {
    await store.renameSpeaker(props.speakerId, next);
    editing.value = false;
  } catch (e) {
    errorToast('Rename failed', e instanceof Error ? e.message : String(e));
  } finally {
    saving.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') commit();
  else if (e.key === 'Escape') cancel();
}
</script>

<template>
  <span
    v-if="!editing"
    class="inline-flex items-center gap-1"
  >
    <span class="font-medium">{{ displayName }}</span>
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground"
      aria-label="Rename speaker"
      @click="startEdit"
    >
      <Pencil class="h-3 w-3" />
    </button>
  </span>
  <span
    v-else
    class="inline-flex items-center gap-1"
  >
    <Input
      ref="inputRef"
      v-model="draft"
      class="h-7 w-32 text-sm"
      :disabled="saving"
      @keydown="onKeydown"
    />
    <Button
      size="icon"
      variant="ghost"
      :disabled="saving"
      @click="commit"
    >
      <Check class="h-3.5 w-3.5" />
    </Button>
    <Button
      size="icon"
      variant="ghost"
      :disabled="saving"
      @click="cancel"
    >
      <XIcon class="h-3.5 w-3.5" />
    </Button>
  </span>
</template>
