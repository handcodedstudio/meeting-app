import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { ulid } from 'ulid';
import type { WebContents } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type {
  TranscribeDonePayload,
  TranscribeErrorPayload,
  TranscribeProgressPayload,
  TranscribeStage
} from '@shared/types/ipc';
import type { WhisperModelSize } from '@shared/types/transcript';
import {
  getDiarizationEmbeddingModel,
  getDiarizationSegmentationModel,
  getVadModelPath,
  getWhisperModelPath
} from './paths.js';
import { decodeToFloat32Pcm } from './audioConvert.js';
import { runWhisper } from './whisperRunner.js';
import { runVad, type VoicedSlice } from './vad.js';
import { diarize } from './diarizer.js';
import {
  fuseWordsWithDiarization,
  parseTranscriptionOutput
} from '../parsers/whisperOutput.js';
import { saveTranscript } from './storage.js';
import { getSettings } from './settings.js';
import { logger } from './logger.js';

export interface RunTranscribeOpts {
  modelSize?: WhisperModelSize;
  title?: string;
}

const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg'
};

function mimeFromPath(path: string): string {
  const ext = extname(path).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

function send<T>(sender: WebContents | null, channel: string, payload: T): void {
  if (!sender || sender.isDestroyed()) return;
  try {
    sender.send(channel, payload);
  } catch (err) {
    logger.warn('failed to send to renderer', { channel, error: String(err) });
  }
}

export interface RunTranscribeResult {
  transcriptId: string;
}

const cancelledJobs = new Set<string>();

export function cancelTranscribe(transcriptId: string): void {
  // Cooperative cancel — checked at stage boundaries. Mid-inference work
  // (whisper or sherpa) will run to completion of the current segment.
  cancelledJobs.add(transcriptId);
}

function checkCancel(transcriptId: string): void {
  if (cancelledJobs.has(transcriptId)) {
    cancelledJobs.delete(transcriptId);
    throw new Error('transcription cancelled');
  }
}

/**
 * Kick off the full pipeline. Returns immediately with the transcriptId; the
 * actual work runs detached and pushes progress / done / error to the renderer.
 */
export function startTranscribe(
  filePath: string,
  opts: RunTranscribeOpts,
  sender: WebContents | null
): RunTranscribeResult {
  const transcriptId = ulid();
  void runTranscribeInternal(transcriptId, filePath, opts, sender).catch((err) => {
    logger.error('transcribe failed', { transcriptId, error: String(err) });
  });
  return { transcriptId };
}

async function runTranscribeInternal(
  transcriptId: string,
  filePath: string,
  opts: RunTranscribeOpts,
  sender: WebContents | null
): Promise<void> {
  let stage: TranscribeStage = 'load';
  const emitProgress = (s: TranscribeStage, percent: number, message?: string): void => {
    stage = s;
    const payload: TranscribeProgressPayload = {
      transcriptId,
      stage: s,
      percent,
      ...(message ? { message } : {})
    };
    send(sender, IPC.TRANSCRIBE_PROGRESS, payload);
  };

  try {
    const settings = await getSettings();
    const modelSize: WhisperModelSize = opts.modelSize ?? settings.whisperModelSize;

    const stats = await stat(filePath);
    const sourceFile = {
      originalPath: filePath,
      importedAt: new Date().toISOString(),
      sizeBytes: stats.size,
      mime: mimeFromPath(filePath)
    };

    emitProgress('load', 0, 'decoding audio');
    const tDecode = Date.now();
    const decoded = await decodeToFloat32Pcm(filePath);
    logger.info('transcribe: decoded', {
      transcriptId,
      durationSec: decoded.durationSec,
      ms: Date.now() - tDecode
    });
    checkCancel(transcriptId);

    let slices: VoicedSlice[] | undefined;
    if (settings.vadEnabled) {
      emitProgress('load', 50, 'detecting speech');
      const tVad = Date.now();
      try {
        slices = await runVad(decoded.samples, { modelPath: getVadModelPath() });
        const voicedSec = slices.reduce((acc, s) => acc + (s.endSec - s.startSec), 0);
        logger.info('transcribe: vad done', {
          transcriptId,
          slices: slices.length,
          voicedSec: Number(voicedSec.toFixed(1)),
          totalSec: Number(decoded.durationSec.toFixed(1)),
          ms: Date.now() - tVad
        });
      } catch (err) {
        logger.warn('transcribe: vad failed, transcribing full audio', {
          transcriptId,
          error: String(err)
        });
        slices = undefined;
      }
      checkCancel(transcriptId);
    }

    emitProgress('transcribe', 0, 'running whisper');
    const tWhisper = Date.now();
    const whisperOut = await runWhisper({
      modelPath: getWhisperModelPath(modelSize),
      samples: decoded.samples,
      language: settings.language === 'auto' ? undefined : settings.language,
      ...(slices ? { slices } : {}),
      onProgress: (pct) => emitProgress('transcribe', pct)
    });
    logger.info('transcribe: whisper done', {
      transcriptId,
      words: whisperOut.words.length,
      ms: Date.now() - tWhisper
    });
    checkCancel(transcriptId);

    emitProgress('diarize', 0, 'running diarization');
    const tDiar = Date.now();
    const segments = await diarize(decoded.samples, {
      segmentationModel: getDiarizationSegmentationModel(),
      embeddingModel: getDiarizationEmbeddingModel()
    });
    logger.info('transcribe: diarize done', {
      transcriptId,
      segments: segments.length,
      ms: Date.now() - tDiar
    });
    emitProgress('diarize', 90, `${new Set(segments.map((s) => s.speaker)).size} speakers detected`);
    checkCancel(transcriptId);

    emitProgress('finalize', 30, 'fusing speakers');
    const fusedWords = fuseWordsWithDiarization(whisperOut.words, segments);

    const createdAt = new Date().toISOString();
    const title = opts.title ?? basename(filePath, extname(filePath));
    const transcript = parseTranscriptionOutput(
      {
        duration: decoded.durationSec,
        language: whisperOut.language,
        words: fusedWords
      },
      {
        id: transcriptId,
        title,
        modelSize,
        sourceFile,
        createdAt,
        sampleRate: decoded.sampleRate
      }
    );

    emitProgress('finalize', 80, 'saving');
    const saved = await saveTranscript(transcript);
    emitProgress('finalize', 100, 'done');

    const donePayload: TranscribeDonePayload = { transcriptId, transcript: saved };
    send(sender, IPC.TRANSCRIBE_DONE, donePayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('transcribe pipeline error', { transcriptId, stage, message });
    const payload: TranscribeErrorPayload = { transcriptId, stage, error: message };
    send(sender, IPC.TRANSCRIBE_ERROR, payload);
  } finally {
    cancelledJobs.delete(transcriptId);
  }
}
