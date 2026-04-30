import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const SAMPLE_RATE = 16000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = join(__dirname, 'vad.worker.js');

export interface VoicedSlice {
  startSec: number;
  endSec: number;
}

export interface VadOptions {
  modelPath: string;
  /** Speech-probability threshold, 0..1. Default 0.5. */
  threshold?: number;
  /** Minimum silence duration (seconds) to split two speech segments. Default 0.5. */
  minSilenceSec?: number;
  /** Minimum speech duration (seconds). Default 0.25. */
  minSpeechSec?: number;
  /** Maximum speech duration (seconds) before forcing a split. Default 30. */
  maxSpeechSec?: number;
  /** Padding (seconds) added to each side of every voiced slice. Default 0.2. */
  paddingSec?: number;
  /**
   * Adjacent voiced slices whose gap is shorter than this (seconds) get merged
   * into one slice. Avoids hammering whisper with dozens of tiny calls.
   * Default 3.
   */
  mergeGapSec?: number;
}

interface WorkerOk {
  ok: true;
  segments: Array<{ startSample: number; endSample: number }>;
}

interface WorkerErr {
  ok: false;
  error: string;
}

export async function runVad(samples: Float32Array, opts: VadOptions): Promise<VoicedSlice[]> {
  await assertExists(opts.modelPath);

  const threshold = opts.threshold ?? 0.5;
  const minSilenceSec = opts.minSilenceSec ?? 0.5;
  const minSpeechSec = opts.minSpeechSec ?? 0.25;
  const maxSpeechSec = opts.maxSpeechSec ?? 30;
  const paddingSec = opts.paddingSec ?? 0.2;
  const mergeGapSec = opts.mergeGapSec ?? 3;

  const raw = await runInWorker(samples, {
    modelPath: opts.modelPath,
    threshold,
    minSilenceDuration: minSilenceSec,
    minSpeechDuration: minSpeechSec,
    maxSpeechDuration: maxSpeechSec
  });

  const totalSec = samples.length / SAMPLE_RATE;
  const padded = raw.map((s) => ({
    startSec: Math.max(0, s.startSample / SAMPLE_RATE - paddingSec),
    endSec: Math.min(totalSec, s.endSample / SAMPLE_RATE + paddingSec)
  }));

  return mergeSlices(padded, mergeGapSec, totalSec);
}

function mergeSlices(
  slices: VoicedSlice[],
  gapSec: number,
  totalSec: number
): VoicedSlice[] {
  if (slices.length === 0) return [];
  const out: VoicedSlice[] = [];
  for (const s of slices) {
    const last = out[out.length - 1];
    if (last && s.startSec - last.endSec <= gapSec) {
      last.endSec = Math.min(totalSec, Math.max(last.endSec, s.endSec));
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

interface WorkerArgs {
  modelPath: string;
  threshold: number;
  minSilenceDuration: number;
  minSpeechDuration: number;
  maxSpeechDuration: number;
}

function runInWorker(
  samples: Float32Array,
  args: WorkerArgs
): Promise<Array<{ startSample: number; endSample: number }>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH);
    const cleanup = (): void => {
      worker.removeAllListeners();
      void worker.terminate();
    };
    worker.once('message', (msg: WorkerOk | WorkerErr) => {
      cleanup();
      if (msg.ok) resolve(msg.segments);
      else reject(new Error(msg.error));
    });
    worker.once('error', (err) => {
      cleanup();
      reject(err);
    });
    worker.postMessage({ samples, ...args });
  });
}

async function assertExists(path: string): Promise<void> {
  try {
    await stat(path);
  } catch {
    throw new Error(
      `Silero VAD model not found at ${path}. Run "pnpm fetch:resources" before transcribing.`
    );
  }
}
