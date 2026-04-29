import type { SpeakerTurn, Word } from '@shared/types/transcript';

export function mergeAdjacentTurnsBySpeaker(turns: SpeakerTurn[], gapSec = 1): SpeakerTurn[] {
  if (turns.length === 0) return [];
  const out: SpeakerTurn[] = [];
  for (const turn of turns) {
    const last = out[out.length - 1];
    if (
      last &&
      last.speaker === turn.speaker &&
      last.displayName === turn.displayName &&
      turn.start - last.end <= gapSec
    ) {
      const mergedText = last.text.endsWith(' ') || turn.text.startsWith(' ')
        ? `${last.text}${turn.text}`
        : `${last.text} ${turn.text}`;
      const mergedWords: Word[] = [...last.words, ...turn.words];
      out[out.length - 1] = {
        ...last,
        end: turn.end,
        text: mergedText.trim(),
        words: mergedWords
      };
    } else {
      out.push({ ...turn, words: [...turn.words] });
    }
  }
  return out;
}

export function applySpeakerRename(turns: SpeakerTurn[], from: string, to: string): SpeakerTurn[] {
  return turns.map((t) => {
    if (t.speaker !== from) return t;
    return {
      ...t,
      displayName: to,
      words: t.words.map((w) => (w.speaker === from ? { ...w, speaker: from } : w))
    };
  });
}
