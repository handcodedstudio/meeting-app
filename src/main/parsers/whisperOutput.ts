import type {
  DiarizationBackend,
  SpeakerEntry,
  SpeakerTurn,
  Transcript,
  TranscriptSourceFile,
  TranscriptStats,
  WhisperModelSize,
  Word
} from '@shared/types/transcript';

export interface RawWord {
  text: string;
  start: number;
  end: number;
  confidence?: number;
  speaker?: string;
}

export interface RawDiarSegment {
  start: number;
  end: number;
  speaker: number | string;
}

export interface RawTranscriptionOutput {
  duration: number;
  language: string;
  words: RawWord[];
}

export interface ParseMeta {
  id: string;
  title: string;
  modelSize: WhisperModelSize;
  sourceFile: TranscriptSourceFile;
  createdAt: string;
  /** Max gap (seconds) between consecutive same-speaker words before a turn break. */
  turnBreakSec?: number;
  /** Override for audio.durationSec if the caller has a more accurate value. */
  durationSecOverride?: number;
  sampleRate?: number;
  diarizationBackend?: DiarizationBackend;
}

const DEFAULT_TURN_BREAK_SEC = 1.0;

/**
 * Tag every word with the speaker label of the diarization segment it falls
 * inside, choosing by midpoint. Words that don't overlap any segment fall back
 * to the nearest segment by edge distance, and an empty diarization defaults
 * everything to SPEAKER_00.
 */
export function fuseWordsWithDiarization(
  words: RawWord[],
  segments: RawDiarSegment[]
): RawWord[] {
  if (segments.length === 0) {
    return words.map((w) => ({ ...w, speaker: 'SPEAKER_00' }));
  }
  // Pre-format speaker labels and sort segments by start.
  const sorted = [...segments]
    .map((s) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      speaker: formatSpeakerId(s.speaker)
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  return words.map((w) => {
    const mid = (w.start + w.end) / 2;
    while (cursor + 1 < sorted.length && sorted[cursor + 1]!.start <= mid) cursor++;
    const here = sorted[cursor]!;
    let chosen = here;
    if (mid < here.start || mid > here.end) {
      // Pick whichever neighbour edge is closer.
      const prev = sorted[cursor - 1];
      const next = sorted[cursor + 1];
      const dist = (s: typeof here) =>
        mid < s.start ? s.start - mid : mid > s.end ? mid - s.end : 0;
      let best = here;
      let bestD = dist(here);
      if (prev && dist(prev) < bestD) {
        best = prev;
        bestD = dist(prev);
      }
      if (next && dist(next) < bestD) {
        best = next;
      }
      chosen = best;
    }
    return { ...w, speaker: chosen.speaker };
  });
}

function formatSpeakerId(raw: number | string): string {
  if (typeof raw === 'string') return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'SPEAKER_00';
  return `SPEAKER_${String(Math.max(0, Math.floor(n))).padStart(2, '0')}`;
}

function normaliseWord(raw: RawWord): Word {
  const word: Word = {
    text: raw.text,
    start: Number(raw.start) || 0,
    end: Number(raw.end) || 0
  };
  if (raw.confidence != null && Number.isFinite(raw.confidence)) {
    word.confidence = raw.confidence;
  }
  if (raw.speaker) {
    word.speaker = raw.speaker;
  }
  return word;
}

function buildSpeakerEntries(orderedSpeakers: string[]): {
  entries: SpeakerEntry[];
  displayNameOf: Map<string, string>;
} {
  const entries: SpeakerEntry[] = [];
  const displayNameOf = new Map<string, string>();
  orderedSpeakers.forEach((id, idx) => {
    const displayName = `Speaker ${idx + 1}`;
    entries.push({ id, displayName });
    displayNameOf.set(id, displayName);
  });
  return { entries, displayNameOf };
}

function turnsFromWords(
  words: Word[],
  displayNameOf: Map<string, string>,
  turnBreakSec: number
): SpeakerTurn[] {
  const turns: SpeakerTurn[] = [];
  let current: SpeakerTurn | null = null;

  for (const w of words) {
    const speakerId = w.speaker || 'SPEAKER_00';
    const displayName = displayNameOf.get(speakerId) ?? speakerId;
    if (
      current &&
      current.speaker === speakerId &&
      w.start - current.end <= turnBreakSec
    ) {
      current.words.push(w);
      current.end = Math.max(current.end, w.end);
      current.text = current.text ? `${current.text} ${w.text}` : w.text;
      continue;
    }
    if (current) turns.push(current);
    current = {
      speaker: speakerId,
      displayName,
      start: w.start,
      end: w.end,
      text: w.text,
      words: [w]
    };
  }
  if (current) turns.push(current);
  return turns;
}

export function parseTranscriptionOutput(
  raw: RawTranscriptionOutput,
  meta: ParseMeta
): Transcript {
  const turnBreakSec = meta.turnBreakSec ?? DEFAULT_TURN_BREAK_SEC;
  const words = (raw.words ?? []).map(normaliseWord);

  const orderedSpeakers: string[] = [];
  const seen = new Set<string>();
  for (const w of words) {
    const id = w.speaker || 'SPEAKER_00';
    if (!seen.has(id)) {
      seen.add(id);
      orderedSpeakers.push(id);
    }
  }
  if (orderedSpeakers.length === 0) {
    orderedSpeakers.push('SPEAKER_00');
  }

  const { entries: speakers, displayNameOf } = buildSpeakerEntries(orderedSpeakers);
  const turns = turnsFromWords(words, displayNameOf, turnBreakSec);

  const stats: TranscriptStats = {
    speakerCount: speakers.length,
    wordCount: words.length,
    turnCount: turns.length
  };

  const durationSec =
    meta.durationSecOverride != null && Number.isFinite(meta.durationSecOverride)
      ? meta.durationSecOverride
      : Number(raw.duration) || 0;

  const transcript: Transcript = {
    id: meta.id,
    schemaVersion: 1,
    title: meta.title,
    sourceFile: meta.sourceFile,
    audio: {
      durationSec,
      ...(meta.sampleRate ? { sampleRate: meta.sampleRate } : {})
    },
    language: raw.language || 'en',
    modelSize: meta.modelSize,
    diarization: { backend: meta.diarizationBackend ?? 'sherpa-onnx-pyannote3+titanet' },
    speakers,
    turns,
    stats,
    createdAt: meta.createdAt,
    updatedAt: meta.createdAt
  };

  return transcript;
}
