import { stat } from 'node:fs/promises';
// sherpa-onnx-node is CJS; importing named bindings from ESM fails at runtime
// because cjs-module-lexer can't statically read the addon's exports. Take the
// default export and destructure here.
import sherpa from 'sherpa-onnx-node';
import { logger } from './logger.js';

const { OfflineSpeakerDiarization } = sherpa;

export interface DiarSegment {
  start: number;
  end: number;
  /** integer cluster id assigned by sherpa-onnx; we map to a label downstream */
  speaker: number;
}

export interface DiarOptions {
  segmentationModel: string;
  embeddingModel: string;
  /** -1 lets sherpa pick the cluster count via threshold */
  numClusters?: number;
  threshold?: number;
  numThreads?: number;
}

/**
 * Run offline speaker diarization on a 16-kHz mono float32 PCM buffer.
 * Returns time-ordered segments with integer speaker ids.
 */
export async function diarize(
  samples: Float32Array,
  opts: DiarOptions
): Promise<DiarSegment[]> {
  await assertExists(opts.segmentationModel, 'segmentation model');
  await assertExists(opts.embeddingModel, 'embedding model');

  const config = {
    segmentation: {
      pyannote: { model: opts.segmentationModel },
      numThreads: opts.numThreads ?? 1,
      debug: 0,
      provider: 'cpu'
    },
    embedding: {
      model: opts.embeddingModel,
      numThreads: opts.numThreads ?? 1,
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

  const sd = new OfflineSpeakerDiarization(config);
  if (sd.sampleRate !== 16000) {
    logger.warn(
      `diarizer: unexpected expected sample rate ${sd.sampleRate}, samples are 16000`
    );
  }
  const raw = sd.process(samples) as Array<{ start: number; end: number; speaker: number }>;
  // sherpa returns ascending start order; normalise field shape and drop
  // zero-length segments that sometimes appear at boundaries.
  return raw
    .map((s) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      speaker: Number(s.speaker) || 0
    }))
    .filter((s) => s.end > s.start);
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
