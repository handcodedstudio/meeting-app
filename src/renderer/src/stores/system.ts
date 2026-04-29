import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { OllamaHealth, SidecarHealth } from '@shared/types/ipc';
import { useIpcSubscriptions } from '@/composables/useIpcSubscriptions';

interface PullState {
  model: string;
  percent: number;
  status: string;
}

interface DownloadState {
  percent: number;
  status: string;
}

export const useSystemStore = defineStore('system', () => {
  const ollama = ref<OllamaHealth>({ running: false, models: [] });
  const sidecar = ref<SidecarHealth>({ ready: false });
  const pyannote = ref<{ ready: boolean }>({ ready: false });
  const ollamaPull = ref<PullState | null>(null);
  const pyannoteDownload = ref<DownloadState | null>(null);
  const polling = ref(false);
  const error = ref<string | null>(null);

  async function pollAll() {
    polling.value = true;
    error.value = null;
    try {
      const [oh, sh] = await Promise.allSettled([
        window.api.ollamaHealth(),
        window.api.sidecarHealth()
      ]);
      if (oh.status === 'fulfilled') ollama.value = oh.value;
      if (sh.status === 'fulfilled') sidecar.value = sh.value;
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

  async function ensurePyannote() {
    error.value = null;
    pyannoteDownload.value = pyannoteDownload.value ?? { percent: 0, status: 'starting' };
    try {
      const res = await window.api.pyannoteEnsure();
      pyannote.value = { ready: res.ready };
      if (res.ready) pyannoteDownload.value = null;
      return res.ready;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      pyannoteDownload.value = null;
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
    }),
    api.onPyannoteDownloadProgress((p) => {
      pyannoteDownload.value = { percent: p.percent, status: p.status };
      if (p.percent >= 100 || p.status === 'done' || p.status === 'success') {
        setTimeout(() => {
          pyannoteDownload.value = null;
          pyannote.value = { ready: true };
        }, 400);
      }
    })
  ]);

  return {
    ollama,
    sidecar,
    pyannote,
    ollamaPull,
    pyannoteDownload,
    polling,
    error,
    pollAll,
    pullOllamaModel,
    ensurePyannote,
    dispose
  };
});
