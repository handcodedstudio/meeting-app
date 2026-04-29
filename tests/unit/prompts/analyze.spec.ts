import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildAnalyzePrompt,
  buildAnalyzeRetryPrompt,
  chunkTranscript,
  mergeAnalyses,
  parseAnalysisResponse,
  AnalysisParseError
} from '../../../src/main/prompts/analyze';
import type { Transcript, SpeakerTurn } from '../../../src/shared/types/transcript';
import type { Analysis } from '../../../src/shared/types/analysis';

const fixturePath = resolve(__dirname, '../../fixtures/transcript.sample.json');
const sampleTranscript = JSON.parse(readFileSync(fixturePath, 'utf8')) as Transcript;

function makeTurn(i: number, speaker: string): SpeakerTurn {
  return {
    speaker,
    displayName: speaker === 'SPEAKER_00' ? 'Sarah' : 'Tom',
    start: i * 5,
    end: i * 5 + 4,
    text: `Turn number ${i} from ${speaker}.`,
    words: [{ text: `t${i}`, start: i * 5, end: i * 5 + 4, speaker }]
  };
}

function makeTranscript(numTurns: number): Transcript {
  return {
    ...sampleTranscript,
    id: 'tr-multi',
    turns: Array.from({ length: numTurns }, (_, i) =>
      makeTurn(i, i % 2 === 0 ? 'SPEAKER_00' : 'SPEAKER_01')
    ),
    stats: { speakerCount: 2, wordCount: numTurns, turnCount: numTurns }
  };
}

describe('buildAnalyzePrompt', () => {
  it('embeds the JSON schema and the rules block', () => {
    const prompt = buildAnalyzePrompt(sampleTranscript);
    expect(prompt).toContain('JSON Schema (draft-07)');
    expect(prompt).toContain('"title": "MeetingAnalysis"');
    expect(prompt).toContain('Rules:');
    expect(prompt).toContain('Do not invent facts');
  });

  it('renders at least one turn line as "#N [t=mm:ss] DisplayName: text"', () => {
    const prompt = buildAnalyzePrompt(sampleTranscript);
    expect(prompt).toMatch(/#0 \[t=00:00\] Sarah:/);
    expect(prompt).toMatch(/#1 \[t=00:04\] Tom:/);
  });

  it('lists the speakers in the header', () => {
    const prompt = buildAnalyzePrompt(sampleTranscript);
    expect(prompt).toContain('speakers: Sarah, Tom');
  });
});

describe('buildAnalyzeRetryPrompt', () => {
  it('appends a JSON-only reminder to the original prompt', () => {
    const original = 'Original prompt.';
    const retry = buildAnalyzeRetryPrompt(original);
    expect(retry.startsWith(original)).toBe(true);
    expect(retry).toContain('not valid JSON');
  });
});

describe('chunkTranscript', () => {
  it('returns the same transcript when turn count fits in one chunk', () => {
    const t = makeTranscript(3);
    const chunks = chunkTranscript(t, { turnsPerChunk: 5, overlap: 1 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(t);
  });

  it('produces overlapping chunks of the requested size', () => {
    const t = makeTranscript(12);
    const chunks = chunkTranscript(t, { turnsPerChunk: 5, overlap: 2 });
    expect(chunks).toHaveLength(4);
    expect(chunks[0]?.turns.length).toBe(5);
    expect(chunks[0]?.turns[0]?.start).toBe(0);
    const last = chunks.at(-1)!;
    expect(last.turns.at(-1)?.start).toBe(11 * 5);
    expect(chunks[1]?.turns[0]?.start).toBe(3 * 5);
  });

  it('clamps overlap to turnsPerChunk - 1', () => {
    const t = makeTranscript(12);
    const chunks = chunkTranscript(t, { turnsPerChunk: 4, overlap: 99 });
    expect(chunks.length).toBeGreaterThan(0);
  });
});

function emptyAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    schemaVersion: 1,
    transcriptId: 'tid',
    model: 'm',
    generatedAt: new Date().toISOString(),
    actionItems: [],
    decisions: [],
    keyDates: [],
    openQuestions: [],
    ...overrides
  };
}

describe('mergeAnalyses', () => {
  it('concatenates per-category items across parts', () => {
    const a = emptyAnalysis({
      actionItems: [{ id: 'a1', description: 'Ship the API by Friday' }]
    });
    const b = emptyAnalysis({
      actionItems: [{ id: 'a2', description: 'Schedule a sync next week' }]
    });
    const merged = mergeAnalyses([a, b]);
    expect(merged.actionItems).toHaveLength(2);
  });

  it('dedupes near-duplicate descriptions (>0.85 similarity)', () => {
    const a = emptyAnalysis({
      decisions: [{ id: 'd1', description: 'Continue daily standup at 9am' }]
    });
    const b = emptyAnalysis({
      decisions: [{ id: 'd2', description: 'Continue daily standup at 9am.' }]
    });
    const merged = mergeAnalyses([a, b]);
    expect(merged.decisions).toHaveLength(1);
  });

  it('keeps clearly different descriptions', () => {
    const a = emptyAnalysis({
      keyDates: [{ id: 'k1', description: 'Launch in May' }]
    });
    const b = emptyAnalysis({
      keyDates: [{ id: 'k2', description: 'Hiring round in October' }]
    });
    const merged = mergeAnalyses([a, b]);
    expect(merged.keyDates).toHaveLength(2);
  });
});

describe('parseAnalysisResponse', () => {
  it('parses a valid JSON response into an Analysis', () => {
    const raw = JSON.stringify({
      actionItems: [
        {
          description: 'Tom ships the API',
          assignee: 'Tom',
          dueDate: '2026-05-01',
          sourceTurnIndex: 1
        }
      ],
      decisions: [{ description: 'Standup continues at 9am' }],
      keyDates: [{ description: 'Delivery', date: '2026-05-01' }],
      openQuestions: [{ description: 'Who will review?' }]
    });
    const out = parseAnalysisResponse(raw, 'tid', 'llama3.1:8b');
    expect(out.transcriptId).toBe('tid');
    expect(out.model).toBe('llama3.1:8b');
    expect(out.actionItems[0]?.assignee).toBe('Tom');
    expect(out.actionItems[0]?.dueDate).toBe('2026-05-01');
    expect(out.actionItems[0]?.id).toBeTruthy();
    expect(out.decisions[0]?.id).toBeTruthy();
    expect(out.keyDates[0]?.date).toBe('2026-05-01');
    expect(out.openQuestions[0]?.description).toBe('Who will review?');
  });

  it('extracts a JSON object via balanced-brace fallback', () => {
    const raw =
      'Some preface { "actionItems": [{"description":"X"}], "decisions": [], "keyDates": [], "openQuestions": [] } trailing prose';
    const out = parseAnalysisResponse(raw, 'tid', 'm');
    expect(out.actionItems).toHaveLength(1);
    expect(out.actionItems[0]?.description).toBe('X');
  });

  it('throws AnalysisParseError(kind="parse") when no JSON object is found', () => {
    expect(() => parseAnalysisResponse('not json at all', 'tid', 'm')).toThrowError(
      AnalysisParseError
    );
    try {
      parseAnalysisResponse('not json at all', 'tid', 'm');
    } catch (e) {
      expect(e).toBeInstanceOf(AnalysisParseError);
      expect((e as AnalysisParseError).kind).toBe('parse');
      expect((e as AnalysisParseError).raw).toBe('not json at all');
    }
  });

  it('throws AnalysisParseError(kind="schema") for invalid shapes', () => {
    const raw = JSON.stringify({ actionItems: [{ noDescription: true }] });
    try {
      parseAnalysisResponse(raw, 'tid', 'm');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AnalysisParseError);
      expect((e as AnalysisParseError).kind).toBe('schema');
    }
  });

  it('always assigns a non-empty id to each item', () => {
    const raw = JSON.stringify({
      actionItems: [{ description: 'Do something' }],
      decisions: [{ description: 'Decided' }],
      keyDates: [{ description: 'Some date' }],
      openQuestions: [{ description: 'Why?' }]
    });
    const out = parseAnalysisResponse(raw, 'tid', 'm');
    expect(out.actionItems[0]?.id).toBeTruthy();
    expect(out.decisions[0]?.id).toBeTruthy();
    expect(out.keyDates[0]?.id).toBeTruthy();
    expect(out.openQuestions[0]?.id).toBeTruthy();
  });
});
