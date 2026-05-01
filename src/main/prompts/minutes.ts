import type { Transcript, SpeakerTurn } from '@shared/types/transcript';
import type { Minutes } from '@shared/types/analysis';
import * as ollamaClient from '../services/ollamaClient.js';
import { formatTimestamp } from '../utils/timestamp.js';
import { logger } from '../services/logger.js';

function renderTurn(turn: SpeakerTurn, index: number): string {
  const text = turn.text.replace(/\s+/g, ' ').trim();
  return `#${index} [t=${formatTimestamp(turn.start)}] ${turn.displayName}: ${text}`;
}

function renderTranscript(transcript: Transcript): string {
  return transcript.turns.map((t, i) => renderTurn(t, i)).join('\n');
}

export function buildMinutesPrompt(transcript: Transcript, template: string): string {
  const role =
    'You are an assistant that produces meeting minutes from a diarized transcript. ' +
    'Follow the user-supplied template exactly: keep its headings, ordering, and style. ' +
    'Replace any {{placeholders}} with information drawn from the transcript when present, ' +
    'or remove the placeholder line if no information is available.';

  const rules = [
    'Rules:',
    '- Output ONLY the completed minutes. No preamble, no explanation, no markdown fences.',
    '- Do not invent facts. If the transcript does not state something, leave it out.',
    "- Use speakers' display names (not raw IDs).",
    '- Dates should be ISO 8601 (YYYY-MM-DD) where possible.',
    '- Preserve the template structure even if some sections end up empty (use a short "None." line).'
  ].join('\n');

  const speakers = transcript.speakers.map((s) => s.displayName).join(', ');
  const header = `Transcript (${transcript.turns.length} turns, speakers: ${speakers}):`;
  const body = renderTranscript(transcript);

  const templateBlock = `Template (use this exact structure for the output):\n\n${template.trim()}`;

  return [role, templateBlock, rules, header, body].join('\n\n');
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  // Models sometimes wrap output in ```markdown ... ``` despite the prompt.
  const fenced = trimmed.match(/^```(?:[a-zA-Z]+)?\n([\s\S]*?)\n```$/);
  if (fenced && fenced[1] !== undefined) return fenced[1].trim();
  return trimmed;
}

export interface RunMinutesArgs {
  transcript: Transcript;
  template: string;
  model: string;
  baseUrl: string;
  settings?: { temperature?: number; numCtx?: number };
  ollama?: Pick<typeof ollamaClient, 'generate'>;
  signal?: AbortSignal;
}

export async function runMinutes({
  transcript,
  template,
  model,
  baseUrl,
  settings,
  ollama,
  signal
}: RunMinutesArgs): Promise<Minutes> {
  const client = ollama ?? ollamaClient;
  const options: Record<string, unknown> = {
    temperature: settings?.temperature ?? 0.2,
    // Use a generous context window — minutes need a holistic view of the
    // whole transcript. Models will silently truncate if it doesn't fit.
    num_ctx: settings?.numCtx ?? 16384
  };

  const prompt = buildMinutesPrompt(transcript, template);
  let raw: string;
  try {
    const args: ollamaClient.OllamaGenerateRequest = {
      model,
      prompt,
      options,
      keepAlive: '15m'
    };
    if (signal !== undefined) args.signal = signal;
    raw = await client.generate(baseUrl, args);
  } catch (err) {
    logger.error('minutes: generate failed', String(err));
    throw err;
  }

  const content = stripFences(raw);
  return {
    schemaVersion: 1,
    transcriptId: transcript.id,
    model,
    generatedAt: new Date().toISOString(),
    template,
    content
  };
}
