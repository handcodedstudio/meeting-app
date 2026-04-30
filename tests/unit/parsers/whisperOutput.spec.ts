import { describe, expect, it } from 'vitest';
import {
  fuseWordsWithDiarization,
  parseTranscriptionOutput,
  type ParseMeta,
  type RawDiarSegment,
  type RawWord
} from '../../../src/main/parsers/whisperOutput';
import type { TranscriptSourceFile } from '../../../src/shared/types/transcript';

const SOURCE_FILE: TranscriptSourceFile = {
  originalPath: '/tmp/sample.wav',
  importedAt: '2026-01-01T00:00:00.000Z',
  sizeBytes: 1234,
  mime: 'audio/wav'
};

const META: ParseMeta = {
  id: '01HZZZSAMPLEID0000000000AA',
  title: 'sample',
  modelSize: 'medium.en',
  sourceFile: SOURCE_FILE,
  createdAt: '2026-01-01T00:00:00.000Z'
};

describe('fuseWordsWithDiarization', () => {
  it('assigns each word to the segment containing its midpoint', () => {
    const words: RawWord[] = [
      { text: 'hi', start: 0.0, end: 0.4 },
      { text: 'there', start: 0.5, end: 0.9 },
      { text: 'sarah', start: 2.1, end: 2.6 }
    ];
    const segs: RawDiarSegment[] = [
      { start: 0.0, end: 1.0, speaker: 0 },
      { start: 2.0, end: 3.0, speaker: 1 }
    ];
    const out = fuseWordsWithDiarization(words, segs);
    expect(out.map((w) => w.speaker)).toEqual(['SPEAKER_00', 'SPEAKER_00', 'SPEAKER_01']);
  });

  it('snaps gap words to the nearest segment edge', () => {
    const words: RawWord[] = [{ text: 'um', start: 1.4, end: 1.6 }];
    const segs: RawDiarSegment[] = [
      { start: 0.0, end: 1.0, speaker: 0 },
      { start: 2.0, end: 3.0, speaker: 1 }
    ];
    // Midpoint 1.5 is equidistant; impl picks the next neighbour (speaker 1).
    const out = fuseWordsWithDiarization(words, segs);
    expect(out[0]?.speaker).toMatch(/^SPEAKER_0[01]$/);
  });

  it('falls back to SPEAKER_00 for everything when no segments are provided', () => {
    const words: RawWord[] = [
      { text: 'a', start: 0, end: 1 },
      { text: 'b', start: 1, end: 2 }
    ];
    const out = fuseWordsWithDiarization(words, []);
    expect(out.every((w) => w.speaker === 'SPEAKER_00')).toBe(true);
  });

  it('preserves a string speaker label without renaming', () => {
    const words: RawWord[] = [{ text: 'x', start: 0, end: 0.5 }];
    const segs: RawDiarSegment[] = [{ start: 0, end: 1, speaker: 'CUSTOM' }];
    expect(fuseWordsWithDiarization(words, segs)[0]?.speaker).toBe('CUSTOM');
  });
});

describe('parseTranscriptionOutput', () => {
  it('builds a canonical Transcript with speaker turns ordered by first appearance', () => {
    const words: RawWord[] = [
      { text: 'hello', start: 0.0, end: 0.5, speaker: 'SPEAKER_00' },
      { text: 'world', start: 0.6, end: 1.0, speaker: 'SPEAKER_00' },
      { text: 'hi', start: 1.5, end: 1.9, speaker: 'SPEAKER_01' }
    ];
    const t = parseTranscriptionOutput(
      { duration: 2.0, language: 'en', words },
      META
    );
    expect(t.speakers.map((s) => s.id)).toEqual(['SPEAKER_00', 'SPEAKER_01']);
    expect(t.speakers.map((s) => s.displayName)).toEqual(['Speaker 1', 'Speaker 2']);
    expect(t.turns).toHaveLength(2);
    expect(t.turns[0]?.text).toBe('hello world');
    expect(t.turns[1]?.text).toBe('hi');
    expect(t.stats).toEqual({ speakerCount: 2, wordCount: 3, turnCount: 2 });
    expect(t.diarization.backend).toBe('sherpa-onnx-pyannote3+titanet');
  });

  it('breaks turns on long silences even within the same speaker', () => {
    const words: RawWord[] = [
      { text: 'one', start: 0.0, end: 0.5, speaker: 'SPEAKER_00' },
      { text: 'two', start: 5.0, end: 5.5, speaker: 'SPEAKER_00' }
    ];
    const t = parseTranscriptionOutput(
      { duration: 6.0, language: 'en', words },
      { ...META, turnBreakSec: 1.0 }
    );
    expect(t.turns).toHaveLength(2);
    expect(t.turns[0]?.text).toBe('one');
    expect(t.turns[1]?.text).toBe('two');
  });

  it('falls back to SPEAKER_00 when input has no speakers', () => {
    const words: RawWord[] = [{ text: 'solo', start: 0.0, end: 1.0 }];
    const t = parseTranscriptionOutput(
      { duration: 1.0, language: 'en', words },
      META
    );
    expect(t.speakers).toEqual([{ id: 'SPEAKER_00', displayName: 'Speaker 1' }]);
    expect(t.turns).toHaveLength(1);
  });

  it('uses durationSecOverride when provided', () => {
    const t = parseTranscriptionOutput(
      { duration: 10, language: 'en', words: [] },
      { ...META, durationSecOverride: 42 }
    );
    expect(t.audio.durationSec).toBe(42);
  });
});
