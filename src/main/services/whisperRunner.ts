import { availableParallelism } from 'node:os';
import { stat } from 'node:fs/promises';
import { Whisper } from 'smart-whisper';
import { logger } from './logger.js';

export interface WhisperWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface WhisperResult {
  language: string;
  words: WhisperWord[];
}

interface RunOptions {
  modelPath: string;
  samples: Float32Array;
  language?: string;
  threads?: number;
  onProgress?: (percent: number) => void;
}

/**
 * Run whisper.cpp on a 16-kHz mono float32 PCM buffer and return word-level
 * timestamps. We always pass `token_timestamps: true` and reconstruct word
 * boundaries by gluing consecutive non-special tokens until we hit whitespace
 * — whisper.cpp produces sub-word tokens (BPE), not full words.
 */
export async function runWhisper(opts: RunOptions): Promise<WhisperResult> {
  await assertExists(opts.modelPath);
  // Loading the model takes a few seconds and allocates ~500 MB for small.en.
  // We tear it down after every transcription so a long-lived dev session
  // doesn't keep a ggml model resident.
  const whisper = new Whisper(opts.modelPath, { gpu: true, offload: 0 });
  try {
    const params: Record<string, unknown> = {
      // smart-whisper's binding only emits the `tokens` array when format
      // is 'detail'. The default 'simple' returns only { from, to, text }.
      format: 'detail',
      language: opts.language ?? 'en',
      no_timestamps: false,
      token_timestamps: true,
      print_progress: false,
      print_realtime: false,
      print_timestamps: false,
      print_special: false,
      suppress_blank: true,
      suppress_non_speech_tokens: true,
      n_threads: opts.threads ?? Math.max(2, Math.min(8, navigatorHardwareConcurrency()))
    };

    const task = await whisper.transcribe(opts.samples, params);
    if (opts.onProgress) {
      task.on('transcribed', (segment) => {
        // smart-whisper doesn't surface a percent — approximate from the
        // segment end vs total duration.
        const totalSec = opts.samples.length / 16000;
        if (totalSec > 0) {
          const pct = Math.min(99, (segment.to / 1000 / totalSec) * 100);
          opts.onProgress?.(pct);
        }
      });
    }

    const segments = (await task.result) as DetailedSegment[];
    const language = segments[0]?.lang ?? opts.language ?? 'en';
    const words = segmentsToWords(segments);
    return { language, words };
  } finally {
    try {
      await whisper.free();
    } catch (err) {
      logger.warn('whisper: free() threw', String(err));
    }
  }
}

interface DetailedToken {
  text: string;
  id: number;
  p: number;
  from?: number;
  to?: number;
}

interface DetailedSegment {
  from: number;
  to: number;
  text: string;
  lang: string;
  confidence: number;
  tokens: DetailedToken[];
}

function segmentsToWords(segments: DetailedSegment[]): WhisperWord[] {
  const out: WhisperWord[] = [];
  for (const seg of segments) {
    const tokens = Array.isArray(seg.tokens) ? seg.tokens : [];
    if (tokens.length === 0) {
      // No token-level data — fall back to the segment as a single "word".
      // Keeps diarization/turn building working even if smart-whisper changes
      // its format default in a future release.
      const text = (seg.text ?? '').trim();
      if (text) {
        out.push({
          text,
          start: Math.max(0, seg.from) / 1000,
          end: Math.max(0, seg.to) / 1000,
          confidence: seg.confidence ?? 0
        });
      }
      continue;
    }
    let buf = '';
    let bufStart = -1;
    let bufEnd = -1;
    let bufP = 0;
    let bufN = 0;
    for (const tok of tokens) {
      const text = tok.text ?? '';
      // Skip special tokens like [_BEG_], [_TT_123]. They begin with `[`.
      if (!text || text.startsWith('[')) continue;
      // A new word begins on whitespace OR when there's no current buffer.
      const startsWord = /^\s/.test(text);
      if (startsWord && buf.trim().length > 0) {
        out.push(emitWord(buf, bufStart, bufEnd, bufP, bufN, seg));
        buf = '';
        bufStart = -1;
        bufEnd = -1;
        bufP = 0;
        bufN = 0;
      }
      const piece = text.replace(/^\s+/, '');
      if (!piece) continue;
      if (bufStart < 0) bufStart = tok.from ?? seg.from;
      bufEnd = tok.to ?? seg.to;
      buf += piece;
      bufP += tok.p ?? 0;
      bufN += 1;
    }
    if (buf.trim().length > 0) {
      out.push(emitWord(buf, bufStart, bufEnd, bufP, bufN, seg));
    }
  }
  return out;
}

function emitWord(
  text: string,
  start: number,
  end: number,
  pSum: number,
  pN: number,
  seg: DetailedSegment
): WhisperWord {
  const ms = (n: number) => Math.max(0, n) / 1000;
  return {
    text: text.trim(),
    start: ms(start >= 0 ? start : seg.from),
    end: ms(end >= 0 ? end : seg.to),
    confidence: pN > 0 ? pSum / pN : 0
  };
}

async function assertExists(path: string): Promise<void> {
  try {
    await stat(path);
  } catch {
    throw new Error(
      `Whisper model not found at ${path}. Run "npm run fetch:resources" before transcribing.`
    );
  }
}

function navigatorHardwareConcurrency(): number {
  try {
    return Math.max(1, availableParallelism());
  } catch {
    return 4;
  }
}
