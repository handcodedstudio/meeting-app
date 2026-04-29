import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { ulid } from 'ulid';
import type { WebContents } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type {
  PyannoteDownloadProgressPayload,
  TranscribeDonePayload,
  TranscribeErrorPayload,
  TranscribeProgressPayload,
  TranscribeStage
} from '@shared/types/ipc';
import type { WhisperModelSize } from '@shared/types/transcript';
import {
  getPyannoteCacheDir,
  getWhisperModelDir
} from './paths.js';
import { getSidecar } from './sidecar.js';
import { ensurePyannoteWeights } from './modelDownloader.js';
import { parseWhisperxOutput, type WhisperxRawOutput } from '../parsers/whisperxOutput.js';
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

async function probeDurationSec(path: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(
        'ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (err) {
      logger.debug('ffprobe spawn failed (not installed?)', String(err));
      resolve(undefined);
      return;
    }
    let stdout = '';
    proc.stdout.on('data', (c) => (stdout += c.toString('utf8')));
    proc.on('error', (err) => {
      logger.debug('ffprobe error', String(err));
      resolve(undefined);
    });
    proc.on('exit', (code) => {
      if (code !== 0) {
        logger.debug('ffprobe exited non-zero', String(code));
        resolve(undefined);
        return;
      }
      const n = Number(stdout.trim());
      resolve(Number.isFinite(n) && n > 0 ? n : undefined);
    });
  });
}

function send<T>(sender: WebContents | null, channel: string, payload: T): void {
  if (!sender || sender.isDestroyed()) return;
  try {
    sender.send(channel, payload);
  } catch (err) {
    logger.warn('failed to send to renderer', { channel, error: String(err) });
  }
}

function isTranscribeStage(s: string): s is TranscribeStage {
  return s === 'load' || s === 'transcribe' || s === 'diarize' || s === 'finalize';
}

export interface RunTranscribeResult {
  transcriptId: string;
}

/**
 * Kicks off the full pipeline. Returns immediately with the transcriptId; the
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

    emitProgress('load', 0, 'preparing');

    const probedDuration = await probeDurationSec(filePath);

    // Pyannote weights — download on first run.
    emitProgress('load', 5, 'ensuring pyannote weights');
    await ensurePyannoteWeights({
      token: settings.huggingfaceToken,
      onProgress: (p) => {
        const payload: PyannoteDownloadProgressPayload = {
          percent: p.percent,
          status: p.status
        };
        send(sender, IPC.PYANNOTE_DOWNLOAD_PROGRESS, payload);
      }
    });

    emitProgress('load', 50, 'starting sidecar');
    const sidecar = getSidecar();
    await sidecar.start();
    emitProgress('load', 100, 'sidecar ready');

    const whisperModelDir = getWhisperModelDir(modelSize);
    const pyannoteCacheDir = getPyannoteCacheDir();

    const raw = await sidecar.call<WhisperxRawOutput>(
      'transcribe',
      {
        audioPath: filePath,
        modelSize,
        whisperModelDir,
        pyannoteCacheDir,
        hfToken: settings.huggingfaceToken,
        jobId: transcriptId
      },
      {
        onProgress: (sidecarStage, percent, message) => {
          if (isTranscribeStage(sidecarStage)) {
            emitProgress(sidecarStage, percent, message);
          }
        }
      }
    );

    emitProgress('finalize', 50, 'building transcript');

    const createdAt = new Date().toISOString();
    const title = opts.title ?? basename(filePath, extname(filePath));
    const transcript = parseWhisperxOutput(raw, {
      id: transcriptId,
      title,
      modelSize,
      sourceFile,
      createdAt,
      durationSecOverride: probedDuration
    });

    const saved = await saveTranscript(transcript);
    emitProgress('finalize', 100, 'saved');

    const donePayload: TranscribeDonePayload = { transcriptId, transcript: saved };
    send(sender, IPC.TRANSCRIBE_DONE, donePayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('transcribe pipeline error', { transcriptId, stage, message });
    const payload: TranscribeErrorPayload = { transcriptId, stage, error: message };
    send(sender, IPC.TRANSCRIBE_ERROR, payload);
  }
}
