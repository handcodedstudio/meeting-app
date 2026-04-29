import { describe, it, expect } from 'vitest';
import { mergeAdjacentTurnsBySpeaker, applySpeakerRename } from '../../../src/renderer/src/lib/merge';
import type { SpeakerTurn } from '../../../src/shared/types/transcript';

function turn(opts: Partial<SpeakerTurn> & {
  speaker: string;
  start: number;
  end: number;
  text: string;
}): SpeakerTurn {
  return {
    speaker: opts.speaker,
    displayName: opts.displayName ?? opts.speaker,
    start: opts.start,
    end: opts.end,
    text: opts.text,
    words: opts.words ?? [
      { text: opts.text, start: opts.start, end: opts.end, speaker: opts.speaker }
    ]
  };
}

describe('mergeAdjacentTurnsBySpeaker', () => {
  it('returns an empty array when given no turns', () => {
    expect(mergeAdjacentTurnsBySpeaker([])).toEqual([]);
  });

  it('collapses two adjacent same-speaker turns separated by a small gap (<= 1s)', () => {
    const turns = [
      turn({ speaker: 'SPEAKER_00', start: 0, end: 2.0, text: 'Hello there.' }),
      turn({ speaker: 'SPEAKER_00', start: 2.3, end: 4.0, text: 'How are you?' })
    ];
    const merged = mergeAdjacentTurnsBySpeaker(turns, 1);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.start).toBe(0);
    expect(merged[0]?.end).toBe(4.0);
    expect(merged[0]?.text).toBe('Hello there. How are you?');
    expect(merged[0]?.words).toHaveLength(2);
  });

  it('keeps two same-speaker turns separated by > gapSec', () => {
    const turns = [
      turn({ speaker: 'SPEAKER_00', start: 0, end: 2.0, text: 'Hello.' }),
      turn({ speaker: 'SPEAKER_00', start: 3.5, end: 5.0, text: 'Hello again.' })
    ];
    const merged = mergeAdjacentTurnsBySpeaker(turns, 1);
    expect(merged).toHaveLength(2);
  });

  it('does not merge across different speakers even when adjacent', () => {
    const turns = [
      turn({ speaker: 'SPEAKER_00', start: 0, end: 1, text: 'Hi.' }),
      turn({ speaker: 'SPEAKER_01', start: 1.1, end: 2, text: 'Hey.' })
    ];
    expect(mergeAdjacentTurnsBySpeaker(turns, 1)).toHaveLength(2);
  });

  it('does not mutate the input array', () => {
    const turns = [
      turn({ speaker: 'SPEAKER_00', start: 0, end: 2.0, text: 'Hi.' }),
      turn({ speaker: 'SPEAKER_00', start: 2.1, end: 4.0, text: 'Bye.' })
    ];
    const before = JSON.stringify(turns);
    mergeAdjacentTurnsBySpeaker(turns, 1);
    expect(JSON.stringify(turns)).toBe(before);
  });
});

describe('applySpeakerRename', () => {
  it('updates only matching turns', () => {
    const turns = [
      turn({ speaker: 'SPEAKER_00', displayName: 'Speaker 1', start: 0, end: 1, text: 'A' }),
      turn({ speaker: 'SPEAKER_01', displayName: 'Speaker 2', start: 1, end: 2, text: 'B' })
    ];
    const renamed = applySpeakerRename(turns, 'SPEAKER_00', 'Sarah');
    expect(renamed[0]?.displayName).toBe('Sarah');
    expect(renamed[1]?.displayName).toBe('Speaker 2');
  });

  it('is idempotent: applying the same rename twice yields the same result', () => {
    const turns = [
      turn({ speaker: 'SPEAKER_00', displayName: 'Speaker 1', start: 0, end: 1, text: 'A' })
    ];
    const once = applySpeakerRename(turns, 'SPEAKER_00', 'Sarah');
    const twice = applySpeakerRename(once, 'SPEAKER_00', 'Sarah');
    expect(twice[0]?.displayName).toBe('Sarah');
    expect(twice).toEqual(once);
  });

  it('returns reference-equal turns for non-matches (no unnecessary copies)', () => {
    const turns = [
      turn({ speaker: 'SPEAKER_01', displayName: 'Speaker 2', start: 0, end: 1, text: 'A' })
    ];
    const out = applySpeakerRename(turns, 'SPEAKER_00', 'Sarah');
    expect(out[0]).toBe(turns[0]);
  });
});
