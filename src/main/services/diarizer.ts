import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { OfflineSpeakerDiarizationConfig } from 'sherpa-onnx-node';

export interface DiarSegment {
  start: number;
  end: number;
  speaker: number;
}

export interface DiarOptions {
  segmentationModel: string;
  embeddingModel: string;
  numClusters?: number;
  threshold?: number;
  numThreads?: number;
  /**
   * Process audio in chunks of this many seconds. Sherpa's pyannote backend
   * crashes on very long inputs (~2hr); 30 min chunks stay inside its tested
   * envelope.
   */
  chunkSec?: number;
  /**
   * Adjacent chunks overlap by this many seconds. Segments inside the overlap
   * are used to map this chunk's speaker IDs back to the previous chunk's
   * global IDs, so the same person keeps the same label across chunks.
   */
  overlapSec?: number;
}

interface WorkerOk {
  ok: true;
  segments: DiarSegment[];
  sampleRate: number;
}

interface WorkerErr {
  ok: false;
  error: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = join(__dirname, 'diarizer.worker.js');

function defaultThreadCount(): number {
  try {
    const n = availableParallelism();
    return Math.max(2, Math.min(8, Math.floor(n / 2)));
  } catch {
    return 4;
  }
}

export async function diarize(
  samples: Float32Array,
  opts: DiarOptions
): Promise<DiarSegment[]> {
  await assertExists(opts.segmentationModel, 'segmentation model');
  await assertExists(opts.embeddingModel, 'embedding model');

  const numThreads = opts.numThreads ?? defaultThreadCount();
  const config: OfflineSpeakerDiarizationConfig = {
    segmentation: {
      pyannote: { model: opts.segmentationModel },
      numThreads,
      debug: 0,
      provider: 'cpu'
    },
    embedding: {
      model: opts.embeddingModel,
      numThreads,
      debug: 0,
      provider: 'cpu'
    },
    clustering: {
      numClusters: opts.numClusters ?? -1,
      threshold: opts.threshold ?? 0.5
    },
    minDurationOn: 0.3,
    minDurationOff: 0.5
  };

  const segments = await runInWorker(
    samples,
    config,
    opts.chunkSec ?? 1800,
    opts.overlapSec ?? 60
  );
  return segments
    .map((s) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      speaker: Number(s.speaker) || 0
    }))
    .filter((s) => s.end > s.start);
}

function runInWorker(
  samples: Float32Array,
  config: OfflineSpeakerDiarizationConfig,
  chunkSec: number,
  overlapSec: number
): Promise<DiarSegment[]> {
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
    worker.once('exit', (code) => {
      if (code !== 0 && code !== 1) {
        cleanup();
        reject(new Error(`diarizer worker exited with code ${code}`));
      }
    });
    worker.postMessage({ samples, config, chunkSec, overlapSec }, [
      samples.buffer as ArrayBuffer
    ]);
  });
}

async function assertExists(path: string, label: string): Promise<void> {
  try {
    await stat(path);
  } catch {
    throw new Error(
      `Diarization ${label} not found at ${path}. Run "npm run fetch:resources" before transcribing.`
    );
  }
}
