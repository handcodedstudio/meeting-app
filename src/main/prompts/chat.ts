import type { Transcript, SpeakerTurn } from '@shared/types/transcript';
import { formatTimestamp } from '../utils/timestamp.js';

const TRUNCATION_MARKER = '[earlier turns omitted]';

function renderTurn(turn: SpeakerTurn, index: number): string {
  const text = turn.text.replace(/\s+/g, ' ').trim();
  return `#${index} [t=${formatTimestamp(turn.start)}] ${turn.displayName}: ${text}`;
}

export interface BuildChatSystemPromptOptions {
  maxChars?: number;
}

export function buildChatSystemPrompt(
  transcript: Transcript,
  opts: BuildChatSystemPromptOptions = {}
): string {
  const maxChars = opts.maxChars ?? 24000;

  const role = [
    'You are an assistant answering questions about a single meeting transcript.',
    'Use only the transcript as ground truth. If something is not stated, say you do not know.',
    'When quoting or referencing a specific moment, cite the turn marker (e.g. #12) and the timestamp.',
    'Refer to people by their display names (not raw speaker IDs).'
  ].join(' ');

  const speakerMap =
    transcript.speakers.length === 0
      ? '(no speakers detected)'
      : transcript.speakers.map((s) => `${s.id} -> ${s.displayName}`).join(', ');
  const speakerBlock = `Speaker map: ${speakerMap}`;

  const stats = [
    `Duration: ${formatTimestamp(transcript.audio.durationSec)}`,
    `Speakers: ${transcript.stats.speakerCount}`,
    `Turns: ${transcript.stats.turnCount}`,
    `Words: ${transcript.stats.wordCount}`,
    `Language: ${transcript.language}`
  ].join(' | ');

  const renderedAll = transcript.turns.map((t, i) => renderTurn(t, i));
  const headerBase = [role, speakerBlock, stats, 'Transcript:'];
  const headerStr = headerBase.join('\n\n');

  const fullBody = renderedAll.join('\n');
  const fullPrompt = `${headerStr}\n${fullBody}`;
  if (fullPrompt.length <= maxChars) return fullPrompt;

  const budget = Math.max(0, maxChars - headerStr.length - TRUNCATION_MARKER.length - 4);
  const kept: string[] = [];
  let used = 0;
  for (let i = renderedAll.length - 1; i >= 0; i--) {
    const line = renderedAll[i] ?? '';
    const lineCost = line.length + 1;
    if (used + lineCost > budget) break;
    kept.push(line);
    used += lineCost;
  }
  kept.reverse();
  const body = kept.length > 0 ? `${TRUNCATION_MARKER}\n${kept.join('\n')}` : TRUNCATION_MARKER;
  return `${headerStr}\n${body}`;
}
