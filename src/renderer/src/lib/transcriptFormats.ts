import type { SpeakerTurn } from '@shared/types/transcript';
import { formatTimestamp } from './time';

export function asPlainText(turns: SpeakerTurn[]): string {
  return turns
    .map((t) => `[${formatTimestamp(t.start)}] ${t.displayName}: ${t.text}`)
    .join('\n\n');
}

export function asMarkdown(turns: SpeakerTurn[]): string {
  return turns
    .map((t) => `**${t.displayName}** _[${formatTimestamp(t.start)}]_\n\n${t.text}`)
    .join('\n\n');
}

export function asJson(turns: SpeakerTurn[]): string {
  return JSON.stringify(
    turns.map((t) => ({
      speaker: t.displayName,
      start: t.start,
      end: t.end,
      text: t.text
    })),
    null,
    2
  );
}

export function asTimestampsOnly(turns: SpeakerTurn[]): string {
  return turns.map((t) => `[${formatTimestamp(t.start)}] ${t.displayName}`).join('\n');
}
