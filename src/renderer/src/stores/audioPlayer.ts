import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

let el: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.preload = 'metadata';
  }
  return el;
}

export const useAudioPlayerStore = defineStore('audioPlayer', () => {
  const transcriptId = ref<string | null>(null);
  const playing = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const playbackRate = ref(1);
  const error = ref<string | null>(null);

  const audio = getAudio();
  audio.playbackRate = playbackRate.value;
  audio.addEventListener('play', () => {
    playing.value = true;
  });
  audio.addEventListener('pause', () => {
    playing.value = false;
  });
  audio.addEventListener('ended', () => {
    playing.value = false;
  });
  audio.addEventListener('timeupdate', () => {
    currentTime.value = audio.currentTime;
  });
  audio.addEventListener('loadedmetadata', () => {
    duration.value = Number.isFinite(audio.duration) ? audio.duration : 0;
  });
  audio.addEventListener('error', () => {
    const code = audio.error?.code;
    const msg = audio.error?.message;
    const reason = msg || (code ? `MediaError code ${code}` : 'unknown');
    error.value = `Audio could not be loaded: ${reason}`;
    playing.value = false;
     
    console.error('[audioPlayer] error', { src: audio.src, code, msg });
  });

  async function ensureSource(id: string): Promise<HTMLAudioElement> {
    if (transcriptId.value !== id) {
      const url = `media://audio/${id}`;
      // Probe first so a 404/500 surfaces a real message instead of the
      // generic "no supported media found" the <audio> element produces.
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
        }
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
         
        console.error('[audioPlayer] media probe failed', e);
        throw e;
      }
      audio.src = url;
      transcriptId.value = id;
      currentTime.value = 0;
      duration.value = 0;
      error.value = null;
    }
    return audio;
  }

  async function waitForMetadata(): Promise<void> {
    if (audio.readyState >= 1) return;
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        audio.removeEventListener('loadedmetadata', onReady);
        audio.removeEventListener('error', onErr);
        resolve();
      };
      const onErr = () => {
        audio.removeEventListener('loadedmetadata', onReady);
        audio.removeEventListener('error', onErr);
        reject(new Error('failed to load audio metadata'));
      };
      audio.addEventListener('loadedmetadata', onReady);
      audio.addEventListener('error', onErr);
    });
  }

  async function play(id: string, fromSec?: number): Promise<void> {
    try {
      await ensureSource(id);
    } catch {
      return;
    }
    try {
      if (typeof fromSec === 'number') {
        await waitForMetadata();
        audio.currentTime = fromSec;
      }
      await audio.play();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);

      console.error('[audioPlayer] play() failed', e);
    }
  }

  function pause(): void {
    audio.pause();
  }

  function toggle(id: string): void {
    if (playing.value && transcriptId.value === id) {
      pause();
    } else {
      void play(id);
    }
  }

  function seekAndPlay(id: string, sec: number): void {
    void play(id, sec);
  }

  function seek(sec: number): void {
    if (!Number.isFinite(sec)) return;
    audio.currentTime = Math.max(0, sec);
    currentTime.value = audio.currentTime;
  }

  async function seekTo(id: string, sec: number): Promise<void> {
    if (!Number.isFinite(sec)) return;
    try {
      await ensureSource(id);
      await waitForMetadata();
    } catch {
      return;
    }
    audio.currentTime = Math.max(0, sec);
    currentTime.value = audio.currentTime;
  }

  function setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) return;
    audio.playbackRate = rate;
    playbackRate.value = rate;
  }

  function reset(): void {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    transcriptId.value = null;
    playing.value = false;
    currentTime.value = 0;
    duration.value = 0;
    error.value = null;
  }

  function isActive(id: string): boolean {
    return transcriptId.value === id;
  }

  const isPlayingFor = computed(() => (id: string) => playing.value && transcriptId.value === id);

  return {
    transcriptId,
    playing,
    currentTime,
    duration,
    playbackRate,
    error,
    play,
    pause,
    toggle,
    seek,
    seekTo,
    seekAndPlay,
    setPlaybackRate,
    reset,
    isActive,
    isPlayingFor
  };
});
