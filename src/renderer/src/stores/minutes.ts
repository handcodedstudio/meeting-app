import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Minutes } from '@shared/types/analysis';

export type MinutesStatus = 'idle' | 'running' | 'done' | 'error';

export interface MinutesEntry {
  status: MinutesStatus;
  data?: Minutes;
  error?: string;
}

export const useMinutesStore = defineStore('minutes', () => {
  const entries = ref<Record<string, MinutesEntry>>({});

  function get(id: string): MinutesEntry {
    return entries.value[id] ?? { status: 'idle' };
  }

  function set(id: string, entry: MinutesEntry) {
    entries.value = { ...entries.value, [id]: entry };
  }

  function setInitial(id: string, data: Minutes | undefined) {
    if (data) set(id, { status: 'done', data });
    else if (!entries.value[id]) set(id, { status: 'idle' });
  }

  async function run(id: string, model?: string) {
    set(id, { status: 'running' });
    try {
      const data = await window.api.minutesRun({ id, model });
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
