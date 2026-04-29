import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Analysis } from '@shared/types/analysis';

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error';

export interface AnalysisEntry {
  status: AnalysisStatus;
  data?: Analysis;
  error?: string;
}

export const useAnalysisStore = defineStore('analysis', () => {
  const entries = ref<Record<string, AnalysisEntry>>({});

  function get(id: string): AnalysisEntry {
    return entries.value[id] ?? { status: 'idle' };
  }

  function set(id: string, entry: AnalysisEntry) {
    entries.value = { ...entries.value, [id]: entry };
  }

  function setInitial(id: string, data: Analysis | undefined) {
    if (data) set(id, { status: 'done', data });
    else if (!entries.value[id]) set(id, { status: 'idle' });
  }

  async function run(id: string, model?: string) {
    set(id, { status: 'running' });
    try {
      const data = await window.api.analyzeRun({ id, model });
      set(id, { status: 'done', data });
    } catch (e) {
      set(id, {
        status: 'error',
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }

  return { entries, get, set, setInitial, run };
});
