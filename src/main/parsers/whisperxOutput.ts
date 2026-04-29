import type {
  SpeakerEntry,
  SpeakerTurn,
  Transcript,
  TranscriptSourceFile,
  TranscriptStats,
  WhisperModelSize,
  Word
} from '@shared/types/transcript';

export interface WhisperxRawWord {
  text: string;
  start: number;
  end: number;
  confidence?: number;
  speaker?: string;
}

export interface WhisperxRawOutput {
  duration: number;
  language: string;
  words: WhisperxRawWord[];
  speakers?: string[];
  segments?: Array<{ start: number; end: number; speaker: string }>;
}

export interface WhisperxParseMeta {
  id: string;
  title: string;
  modelSize: WhisperModelSize;
  sourceFile: TranscriptSourceFile;
  createdAt: string;
  /** Max gap (seconds) between consecutive same-speaker words before a turn break. */
  turnBreakSec?: number;
  /** Override for audio.durationSec if the caller has a more accurate value (e.g. ffprobe). */
  durationSecOverride?: number;
  sampleRate?: number;
}

const DEFAULT_TURN_BREAK_SEC = 1.0;

function normaliseWord(raw: WhisperxRawWord): Word {
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

export function parseWhisperxOutput(
  raw: WhisperxRawOutput,
  meta: WhisperxParseMeta
): Transcript {
  const turnBreakSec = meta.turnBreakSec ?? DEFAULT_TURN_BREAK_SEC;
  const words = (raw.words ?? []).map(normaliseWord);

  // Order speakers by first appearance in the word stream.
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
    diarization: { backend: 'pyannote-3.1' },
    speakers,
    turns,
    stats,
    createdAt: meta.createdAt,
    updatedAt: meta.createdAt
  };

  return transcript;
}
