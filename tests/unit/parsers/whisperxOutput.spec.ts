import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseWhisperxOutput,
  type WhisperxRawOutput,
  type WhisperxParseMeta
} from '../../../src/main/parsers/whisperxOutput';

const fixturePath = resolve(__dirname, '../../fixtures/whisperx-output.json');
const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as WhisperxRawOutput;

function meta(overrides: Partial<WhisperxParseMeta> = {}): WhisperxParseMeta {
  return {
    id: '01HXSAMPLEAAAAAAAAAAAAAAAA',
    title: 'Sample',
    modelSize: 'small.en',
    sourceFile: {
      originalPath: '/tmp/sample.mp3',
      importedAt: '2026-04-28T09:00:00.000Z',
      sizeBytes: 1024,
      mime: 'audio/mpeg'
    },
    createdAt: '2026-04-28T09:00:00.000Z',
    ...overrides
  };
}

describe('parseWhisperxOutput', () => {
  it('produces a Transcript with the expected top-level shape', () => {
    const t = parseWhisperxOutput(raw, meta());
    expect(t.id).toBe('01HXSAMPLEAAAAAAAAAAAAAAAA');
    expect(t.schemaVersion).toBe(1);
    expect(t.diarization.backend).toBe('pyannote-3.1');
    expect(t.language).toBe('en');
    expect(t.modelSize).toBe('small.en');
    expect(t.audio.durationSec).toBe(12.5);
    expect(t.createdAt).toBe('2026-04-28T09:00:00.000Z');
    expect(t.updatedAt).toBe(t.createdAt);
  });

  it('orders speakers by first appearance and assigns sequential display names', () => {
    const t = parseWhisperxOutput(raw, meta());
    expect(t.speakers.map((s) => s.id)).toEqual(['SPEAKER_00', 'SPEAKER_01']);
    expect(t.speakers.map((s) => s.displayName)).toEqual(['Speaker 1', 'Speaker 2']);
  });

  it('produces turns with monotonically non-decreasing starts', () => {
    const t = parseWhisperxOutput(raw, meta());
    for (let i = 1; i < t.turns.length; i++) {
      const prev = t.turns[i - 1]!;
      const cur = t.turns[i]!;
      expect(cur.start).toBeGreaterThanOrEqual(prev.start);
    }
  });

  it('collapses contiguous same-speaker words within the turn-break gap', () => {
    const t = parseWhisperxOutput(raw, meta());
    expect(t.turns.length).toBeGreaterThanOrEqual(3);
    const first = t.turns[0]!;
    expect(first.speaker).toBe('SPEAKER_00');
    expect(first.text).toBe('Hello everyone, welcome.');
  });

  it('handles a missing-speaker word by falling back to SPEAKER_00', () => {
    const t = parseWhisperxOutput(raw, meta());
    const turnContainingMe = t.turns.find((tr) => tr.words.some((w) => w.text === 'me.'));
    expect(turnContainingMe).toBeDefined();
    expect(turnContainingMe?.speaker).toBe('SPEAKER_00');
  });

  it('computes accurate stats', () => {
    const t = parseWhisperxOutput(raw, meta());
    expect(t.stats.speakerCount).toBe(t.speakers.length);
    expect(t.stats.wordCount).toBe(raw.words.length);
    expect(t.stats.turnCount).toBe(t.turns.length);
  });

  it('respects durationSecOverride when provided', () => {
    const t = parseWhisperxOutput(raw, meta({ durationSecOverride: 99.9 }));
    expect(t.audio.durationSec).toBe(99.9);
  });

  it('attaches sampleRate when provided', () => {
    const t = parseWhisperxOutput(raw, meta({ sampleRate: 16000 }));
    expect(t.audio.sampleRate).toBe(16000);
  });

  it('synthesises a single SPEAKER_00 entry when the input has no words', () => {
    const t = parseWhisperxOutput({ duration: 0, language: 'en', words: [] }, meta());
    expect(t.speakers.map((s) => s.id)).toEqual(['SPEAKER_00']);
    expect(t.turns).toHaveLength(0);
  });
});
