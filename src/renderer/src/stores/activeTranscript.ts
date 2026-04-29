import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Transcript } from '@shared/types/transcript';
import type { TranscribeStage } from '@shared/types/ipc';
import { useIpcSubscriptions } from '@/composables/useIpcSubscriptions';

interface ProgressState {
  stage: TranscribeStage;
  percent: number;
  message?: string;
}

export const useActiveTranscriptStore = defineStore('activeTranscript', () => {
  const transcript = ref<Transcript | null>(null);
  const progress = ref<ProgressState | null>(null);
  const loadingId = ref<string | null>(null);
  const transcribingId = ref<string | null>(null);
  const error = ref<string | null>(null);

  async function load(id: string) {
    loadingId.value = id;
    error.value = null;
    try {
      const res = await window.api.transcriptsLoad({ id });
      transcript.value = res.transcript;
    } catch (e) {
      transcript.value = null;
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loadingId.value = null;
    }
  }

  async function startTranscribe(filePath: string): Promise<string | null> {
    error.value = null;
    progress.value = { stage: 'load', percent: 0 };
    try {
      const res = await window.api.transcribeStart({ filePath });
      transcribingId.value = res.transcriptId;
      return res.transcriptId;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      progress.value = null;
      return null;
    }
  }

  async function cancelTranscribe() {
    if (!transcribingId.value) return;
    try {
      await window.api.transcribeCancel({ transcriptId: transcribingId.value });
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      transcribingId.value = null;
      progress.value = null;
    }
  }

  async function renameSpeaker(from: string, to: string) {
    if (!transcript.value) return;
    const id = transcript.value.id;
    try {
      const updated = await window.api.transcriptsRenameSpeaker({ id, from, to });
      transcript.value = updated;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  function clear() {
    transcript.value = null;
    progress.value = null;
    error.value = null;
  }

  const dispose = useIpcSubscriptions((api) => [
    api.onTranscribeProgress((p) => {
      if (transcribingId.value && p.transcriptId !== transcribingId.value) return;
      progress.value = { stage: p.stage, percent: p.percent, message: p.message };
    }),
    api.onTranscribeDone((p) => {
      if (transcribingId.value && p.transcriptId !== transcribingId.value) return;
      transcript.value = p.transcript;
      progress.value = { stage: 'finalize', percent: 100 };
      transcribingId.value = null;
    }),
    api.onTranscribeError((p) => {
      if (transcribingId.value && p.transcriptId !== transcribingId.value) return;
      error.value = p.error;
      transcribingId.value = null;
      progress.value = null;
    })
  ]);

  return {
    transcript,
    progress,
    loadingId,
    transcribingId,
    error,
    load,
    startTranscribe,
    cancelTranscribe,
    renameSpeaker,
    clear,
    dispose
  };
});
