import { availableParallelism } from 'node:os';
import { stat } from 'node:fs/promises';
import { Whisper, WhisperSamplingStrategy } from 'smart-whisper';
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
  /**
   * Optional voiced slices, in seconds. When provided, whisper is called once
   * per slice with offset/duration set; silent regions between slices are
   * skipped entirely. Whisper.cpp returns segment timestamps in original-audio
   * coordinates.
   */
  slices?: Array<{ startSec: number; endSec: number }>;
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
  // Loading the model takes a few seconds and allocates ~600 MB for medium.en (q5_0).
  // We tear it down after every transcription so a long-lived dev session
  // doesn't keep a ggml model resident.
  const whisper = new Whisper(opts.modelPath, { gpu: true, offload: 0 });
  try {
    const baseParams: Record<string, unknown> = {
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
      // Greedy decoding with no temperature fallback — for clean meeting audio
      // the default beam-search + retry-on-low-confidence loop is wasted work.
      strategy: WhisperSamplingStrategy.WHISPER_SAMPLING_GREEDY,
      beam_size: 1,
      best_of: 1,
      temperature: 0,
      temperature_inc: 0,
      n_threads: opts.threads ?? Math.max(2, Math.min(8, navigatorHardwareConcurrency()))
    };

    const totalSec = opts.samples.length / 16000;
    const slices =
      opts.slices && opts.slices.length > 0
        ? opts.slices
        : [{ startSec: 0, endSec: totalSec }];

    const totalVoicedSec = slices.reduce(
      (acc, s) => acc + Math.max(0, s.endSec - s.startSec),
      0
    );
    let voicedDoneSec = 0;
    let language: string | undefined;
    const allWords: WhisperWord[] = [];

    for (const slice of slices) {
      const sliceLenSec = Math.max(0, slice.endSec - slice.startSec);
      if (sliceLenSec <= 0) continue;
      const params = {
        ...baseParams,
        offset_ms: Math.max(0, Math.round(slice.startSec * 1000)),
        duration_ms: Math.max(0, Math.round(sliceLenSec * 1000))
      };
      const task = await whisper.transcribe(opts.samples, params);
      if (opts.onProgress && totalVoicedSec > 0) {
        task.on('transcribed', (segment) => {
          const inSliceSec = Math.max(
            0,
            Math.min(sliceLenSec, segment.to / 1000 - slice.startSec)
          );
          const pct = Math.min(
            99,
            ((voicedDoneSec + inSliceSec) / totalVoicedSec) * 100
          );
          opts.onProgress?.(pct);
        });
      }
      const segments = (await task.result) as DetailedSegment[];
      if (!language) language = segments[0]?.lang;
      allWords.push(...segmentsToWords(segments));
      voicedDoneSec += sliceLenSec;
    }

    return { language: language ?? opts.language ?? 'en', words: allWords };
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
      `Whisper model not found at ${path}. Run "pnpm fetch:resources" before transcribing.`
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
