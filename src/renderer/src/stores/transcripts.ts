import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { TranscriptSummary } from '@shared/types/transcript';
import { useIpcSubscriptions } from '@/composables/useIpcSubscriptions';

export const useTranscriptsStore = defineStore('transcripts', () => {
  const summaries = ref<TranscriptSummary[]>([]);
  const loading = ref(false);
  const currentId = ref<string | null>(null);
  const error = ref<string | null>(null);

  async function refresh() {
    loading.value = true;
    error.value = null;
    try {
      summaries.value = await window.api.transcriptsList();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function rename(id: string, title: string): Promise<void> {
    const idx = summaries.value.findIndex((s) => s.id === id);
    const previous = idx >= 0 ? summaries.value[idx] : null;
    if (idx >= 0 && previous) {
      summaries.value = [
        ...summaries.value.slice(0, idx),
        { ...previous, title },
        ...summaries.value.slice(idx + 1)
      ];
    }
    try {
      const updated = await window.api.transcriptsRename({ id, title });
      if (idx >= 0) {
        summaries.value = [
          ...summaries.value.slice(0, idx),
          updated,
          ...summaries.value.slice(idx + 1)
        ];
      }
    } catch (e) {
      if (idx >= 0 && previous) {
        summaries.value = [
          ...summaries.value.slice(0, idx),
          previous,
          ...summaries.value.slice(idx + 1)
        ];
      }
      throw e;
    }
  }

  async function remove(id: string): Promise<void> {
    const idx = summaries.value.findIndex((s) => s.id === id);
    const previous = idx >= 0 ? summaries.value[idx] : null;
    if (idx >= 0) {
      summaries.value = [...summaries.value.slice(0, idx), ...summaries.value.slice(idx + 1)];
    }
    try {
      await window.api.transcriptsDelete({ id });
      if (currentId.value === id) currentId.value = null;
    } catch (e) {
      if (idx >= 0 && previous) {
        summaries.value = [
          ...summaries.value.slice(0, idx),
          previous,
          ...summaries.value.slice(idx + 1)
        ];
      }
      throw e;
    }
  }

  const dispose = useIpcSubscriptions((api) => [api.onTranscribeDone(() => refresh())]);

  // HMR cleanup MUST live in this module so import.meta.hot resolves to the
  // store's hot record. See useIpcSubscriptions for the rationale.
  if (import.meta.hot) import.meta.hot.dispose(dispose);

  return {
    summaries,
    loading,
    currentId,
    error,
    refresh,
    rename,
    remove,
    dispose
  };
});
