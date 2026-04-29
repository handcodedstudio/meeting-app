import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildChatSystemPrompt } from '../../../src/main/prompts/chat';
import type { Transcript, SpeakerTurn } from '../../../src/shared/types/transcript';

const fixturePath = resolve(__dirname, '../../fixtures/transcript.sample.json');
const sampleTranscript = JSON.parse(readFileSync(fixturePath, 'utf8')) as Transcript;

function makeTranscript(turnCount: number): Transcript {
  const turns: SpeakerTurn[] = Array.from({ length: turnCount }, (_, i) => ({
    speaker: i % 2 === 0 ? 'SPEAKER_00' : 'SPEAKER_01',
    displayName: i % 2 === 0 ? 'Sarah' : 'Tom',
    start: i * 4,
    end: i * 4 + 3,
    text: `This is turn number ${i} with some content for testing budgets.`,
    words: []
  }));
  return {
    ...sampleTranscript,
    turns,
    stats: { speakerCount: 2, wordCount: turnCount, turnCount }
  };
}

describe('buildChatSystemPrompt', () => {
  it('embeds the speaker map using id -> displayName', () => {
    const prompt = buildChatSystemPrompt(sampleTranscript);
    expect(prompt).toContain('Speaker map:');
    expect(prompt).toContain('SPEAKER_00 -> Sarah');
    expect(prompt).toContain('SPEAKER_01 -> Tom');
  });

  it('includes turn lines with #N markers for each turn', () => {
    const prompt = buildChatSystemPrompt(sampleTranscript);
    expect(prompt).toMatch(/#0 \[t=00:00\] Sarah:/);
    expect(prompt).toMatch(/#1 \[t=00:04\] Tom:/);
  });

  it('renders a stats line', () => {
    const prompt = buildChatSystemPrompt(sampleTranscript);
    expect(prompt).toContain('Speakers:');
    expect(prompt).toContain('Turns:');
    expect(prompt).toContain('Words:');
    expect(prompt).toContain('Language: en');
  });

  it('returns the full prompt when under maxChars', () => {
    const big = 100_000;
    const prompt = buildChatSystemPrompt(sampleTranscript, { maxChars: big });
    expect(prompt).not.toContain('[earlier turns omitted]');
  });

  it('truncates older turns first and inserts the truncation marker when over budget', () => {
    const t = makeTranscript(80);
    const prompt = buildChatSystemPrompt(t, { maxChars: 1500 });
    expect(prompt).toContain('[earlier turns omitted]');
    expect(prompt).toContain('#79');
    expect(prompt).not.toMatch(/#0 \[t=00:00\]/);
    expect(prompt.length).toBeLessThanOrEqual(1500 + 200);
  });

  it('renders a placeholder when no speakers were detected', () => {
    const empty: Transcript = {
      ...sampleTranscript,
      speakers: [],
      turns: [],
      stats: { speakerCount: 0, wordCount: 0, turnCount: 0 }
    };
    const prompt = buildChatSystemPrompt(empty);
    expect(prompt).toContain('(no speakers detected)');
  });
});
