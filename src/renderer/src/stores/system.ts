import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { OllamaHealth } from '@shared/types/ipc';
import { useIpcSubscriptions } from '@/composables/useIpcSubscriptions';

interface PullState {
  model: string;
  percent: number;
  status: string;
}

export const useSystemStore = defineStore('system', () => {
  const ollama = ref<OllamaHealth>({ running: false, models: [] });
  const ollamaPull = ref<PullState | null>(null);
  const polling = ref(false);
  const error = ref<string | null>(null);

  async function pollAll() {
    polling.value = true;
    error.value = null;
    try {
      const oh = await window.api.ollamaHealth();
      ollama.value = oh;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      polling.value = false;
    }
  }

  async function pullOllamaModel(model: string) {
    error.value = null;
    ollamaPull.value = { model, percent: 0, status: 'starting' };
    try {
      await window.api.ollamaPullModel({ model });
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      ollamaPull.value = null;
      throw e;
    }
  }

  const dispose = useIpcSubscriptions((api) => [
    api.onOllamaPullProgress((p) => {
      ollamaPull.value = { model: p.model, percent: p.percent, status: p.status };
      if (p.percent >= 100 || p.status === 'success') {
        setTimeout(() => {
          ollamaPull.value = null;
          pollAll();
        }, 600);
      }
    })
  ]);

  if (import.meta.hot) import.meta.hot.dispose(dispose);

  return {
    ollama,
    ollamaPull,
    polling,
    error,
    pollAll,
    pullOllamaModel,
    dispose
  };
});
