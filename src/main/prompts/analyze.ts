import { ulid } from 'ulid';
import { z } from 'zod';
import type { Transcript, SpeakerTurn } from '@shared/types/transcript';
import type {
  Analysis,
  ActionItem,
  Decision,
  KeyDate,
  OpenQuestion
} from '@shared/types/analysis';
import * as ollamaClient from '../services/ollamaClient.js';
import { formatTimestamp } from '../utils/timestamp.js';
import { logger } from '../services/logger.js';

const ANALYSIS_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'MeetingAnalysis',
  type: 'object',
  additionalProperties: false,
  required: ['actionItems', 'decisions', 'keyDates', 'openQuestions'],
  properties: {
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description'],
        properties: {
          description: { type: 'string' },
          assignee: { type: 'string' },
          dueDate: { type: 'string', description: 'ISO 8601 date (YYYY-MM-DD) when known' },
          sourceTurnIndex: { type: 'integer', minimum: 0 }
        }
      }
    },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description'],
        properties: {
          description: { type: 'string' },
          sourceTurnIndex: { type: 'integer', minimum: 0 }
        }
      }
    },
    keyDates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description'],
        properties: {
          date: { type: 'string', description: 'ISO 8601 date (YYYY-MM-DD) when known' },
          description: { type: 'string' },
          sourceTurnIndex: { type: 'integer', minimum: 0 }
        }
      }
    },
    openQuestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description'],
        properties: {
          description: { type: 'string' },
          sourceTurnIndex: { type: 'integer', minimum: 0 }
        }
      }
    }
  }
} as const;

function renderTurn(turn: SpeakerTurn, index: number): string {
  const text = turn.text.replace(/\s+/g, ' ').trim();
  return `#${index} [t=${formatTimestamp(turn.start)}] ${turn.displayName}: ${text}`;
}

function renderTranscript(transcript: Transcript): string {
  return transcript.turns.map((t, i) => renderTurn(t, i)).join('\n');
}

export function buildAnalyzePrompt(transcript: Transcript): string {
  const role =
    'You are an assistant that extracts structured meeting outcomes from a diarized transcript.';
  const schemaBlock = `JSON Schema (draft-07) for your output:\n${JSON.stringify(
    ANALYSIS_JSON_SCHEMA,
    null,
    2
  )}`;
  const rules = [
    'Rules:',
    '- Output ONLY a single JSON object that conforms to the schema. No prose, no markdown fences.',
    '- Do not invent facts. If something is not stated, omit it.',
    '- Use speakers\' display names (not raw IDs) when referring to assignees.',
    '- Dates must be ISO 8601 (YYYY-MM-DD) when extractable; otherwise omit the date field but keep the description.',
    '- When a turn directly supports an item, include its index as `sourceTurnIndex` (matching the `#N` markers below).',
    '- If a category has no items, return an empty array for it.'
  ].join('\n');

  const body = renderTranscript(transcript);
  const header = `Transcript (${transcript.turns.length} turns, speakers: ${transcript.speakers
    .map((s) => s.displayName)
    .join(', ')}):`;

  return [role, schemaBlock, rules, header, body].join('\n\n');
}

export function buildAnalyzeRetryPrompt(originalPrompt: string): string {
  return `${originalPrompt}\n\nIMPORTANT: Your previous output was not valid JSON. Return ONLY a single JSON object that matches the schema above. Do not wrap it in markdown fences. Do not include any prose before or after.`;
}

// Models routinely emit `null` for unknown optional fields despite the prompt
// asking for omission. Accept null + undefined and coerce to undefined.
const optionalString = z
  .string()
  .nullish()
  .transform((v) => (v == null || v === '' ? undefined : v));
const optionalNonNegInt = z
  .number()
  .int()
  .nonnegative()
  .nullish()
  .transform((v) => (v == null ? undefined : v));

const itemBaseContent = z.object({
  description: z.string().min(1),
  sourceTurnIndex: optionalNonNegInt
});

const analysisContentSchema = z.object({
  actionItems: z
    .array(
      itemBaseContent.extend({
        assignee: optionalString,
        dueDate: optionalString
      })
    )
    .default([]),
  decisions: z.array(itemBaseContent).default([]),
  keyDates: z
    .array(itemBaseContent.extend({ date: optionalString }))
    .default([]),
  openQuestions: z.array(itemBaseContent).default([])
});

export type AnalysisContent = z.infer<typeof analysisContentSchema>;

export class AnalysisParseError extends Error {
  readonly kind: 'parse' | 'schema';
  readonly raw: string;
  constructor(kind: 'parse' | 'schema', message: string, raw: string) {
    super(message);
    this.name = 'AnalysisParseError';
    this.kind = kind;
    this.raw = raw;
  }
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function withId<T extends object>(item: T): T & { id: string } {
  const existing = (item as { id?: unknown }).id;
  const id = typeof existing === 'string' && existing.length > 0 ? existing : ulid();
  return { ...item, id };
}

export function parseAnalysisResponse(
  raw: string,
  transcriptId: string,
  model: string
): Analysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const slice = extractFirstJsonObject(raw);
    if (slice === null) {
      throw new AnalysisParseError('parse', 'Response is not JSON-parseable', raw);
    }
    try {
      parsed = JSON.parse(slice);
    } catch (err) {
      throw new AnalysisParseError(
        'parse',
        `Extracted JSON object failed to parse: ${String(err)}`,
        raw
      );
    }
  }

  let content: AnalysisContent;
  try {
    content = analysisContentSchema.parse(parsed);
  } catch (err) {
    throw new AnalysisParseError('schema', `Schema validation failed: ${String(err)}`, raw);
  }

  const actionItems: ActionItem[] = content.actionItems.map((i) => {
    const out: ActionItem = { ...withId(i), description: i.description };
    if (i.assignee !== undefined) out.assignee = i.assignee;
    if (i.dueDate !== undefined) out.dueDate = i.dueDate;
    if (i.sourceTurnIndex !== undefined) out.sourceTurnIndex = i.sourceTurnIndex;
    return out;
  });
  const decisions: Decision[] = content.decisions.map((i) => {
    const out: Decision = { ...withId(i), description: i.description };
    if (i.sourceTurnIndex !== undefined) out.sourceTurnIndex = i.sourceTurnIndex;
    return out;
  });
  const keyDates: KeyDate[] = content.keyDates.map((i) => {
    const out: KeyDate = { ...withId(i), description: i.description };
    if (i.date !== undefined) out.date = i.date;
    if (i.sourceTurnIndex !== undefined) out.sourceTurnIndex = i.sourceTurnIndex;
    return out;
  });
  const openQuestions: OpenQuestion[] = content.openQuestions.map((i) => {
    const out: OpenQuestion = { ...withId(i), description: i.description };
    if (i.sourceTurnIndex !== undefined) out.sourceTurnIndex = i.sourceTurnIndex;
    return out;
  });

  return {
    schemaVersion: 1,
    transcriptId,
    model,
    generatedAt: new Date().toISOString(),
    actionItems,
    decisions,
    keyDates,
    openQuestions
  };
}

// Default chunking heuristics — keeps each chunk under ~6k tokens for an 8k
// context model and overlaps enough that an action item spanning a boundary
// gets dedupe-merged via mergeAnalyses.
const DEFAULT_TURNS_PER_CHUNK = 80;
const DEFAULT_CHUNK_OVERLAP = 8;

export interface ChunkOptions {
  turnsPerChunk?: number;
  overlap?: number;
}

export function chunkTranscript(
  transcript: Transcript,
  opts: ChunkOptions = {}
): Transcript[] {
  const turnsPerChunk = Math.max(1, opts.turnsPerChunk ?? DEFAULT_TURNS_PER_CHUNK);
  const overlap = Math.max(0, Math.min(opts.overlap ?? DEFAULT_CHUNK_OVERLAP, turnsPerChunk - 1));
  const turns = transcript.turns;
  if (turns.length <= turnsPerChunk) return [transcript];

  const stride = turnsPerChunk - overlap;
  const chunks: Transcript[] = [];
  for (let start = 0; start < turns.length; start += stride) {
    const end = Math.min(turns.length, start + turnsPerChunk);
    const slice = turns.slice(start, end);
    const wordCount = slice.reduce((acc, t) => acc + t.words.length, 0);
    const speakers = new Set(slice.map((t) => t.speaker));
    const chunk: Transcript = {
      ...transcript,
      turns: slice,
      stats: {
        speakerCount: speakers.size,
        wordCount,
        turnCount: slice.length
      }
    };
    chunks.push(chunk);
    if (end >= turns.length) break;
  }
  return chunks;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n] ?? 0;
}

function similar(a: string, b: string): boolean {
  const an = a.trim().toLowerCase();
  const bn = b.trim().toLowerCase();
  if (an.length === 0 || bn.length === 0) return an === bn;
  const dist = levenshtein(an, bn);
  const max = Math.max(an.length, bn.length);
  if (max === 0) return true;
  return 1 - dist / max > 0.85;
}

function dedupeBy<T extends { description: string }>(items: T[]): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (out.some((existing) => similar(existing.description, item.description))) continue;
    out.push(item);
  }
  return out;
}

export function mergeAnalyses(
  parts: Analysis[]
): Omit<Analysis, 'transcriptId' | 'model' | 'generatedAt'> {
  const actionItems: ActionItem[] = [];
  const decisions: Decision[] = [];
  const keyDates: KeyDate[] = [];
  const openQuestions: OpenQuestion[] = [];
  for (const p of parts) {
    actionItems.push(...p.actionItems);
    decisions.push(...p.decisions);
    keyDates.push(...p.keyDates);
    openQuestions.push(...p.openQuestions);
  }
  return {
    schemaVersion: 1,
    actionItems: dedupeBy(actionItems),
    decisions: dedupeBy(decisions),
    keyDates: dedupeBy(keyDates),
    openQuestions: dedupeBy(openQuestions)
  };
}

export interface RunAnalyzeArgs {
  transcript: Transcript;
  model: string;
  baseUrl: string;
  settings?: { temperature?: number; numCtx?: number };
  ollama?: Pick<typeof ollamaClient, 'generate'>;
  signal?: AbortSignal;
}

export async function runAnalyze({
  transcript,
  model,
  baseUrl,
  settings,
  ollama,
  signal
}: RunAnalyzeArgs): Promise<Analysis> {
  const client = ollama ?? ollamaClient;
  const options: Record<string, unknown> = {
    temperature: settings?.temperature ?? 0.1,
    num_ctx: settings?.numCtx ?? 8192
  };

  const chunks = chunkTranscript(transcript);
  const partials: Analysis[] = [];
  const rawOutputs: string[] = [];
  let hadFallback = false;

  for (const chunk of chunks) {
    const prompt = buildAnalyzePrompt(chunk);
    let raw: string;
    try {
      const args: ollamaClient.OllamaGenerateRequest = {
        model,
        prompt,
        format: 'json',
        options
      };
      if (signal !== undefined) args.signal = signal;
      raw = await client.generate(baseUrl, args);
    } catch (err) {
      logger.error('analyze: generate failed', String(err));
      throw err;
    }
    rawOutputs.push(raw);

    let parsed: Analysis | null = null;
    try {
      parsed = parseAnalysisResponse(raw, transcript.id, model);
    } catch (err) {
      if (err instanceof AnalysisParseError) {
        logger.warn('analyze: parse failed, retrying once', { kind: err.kind });
        try {
          const retryArgs: ollamaClient.OllamaGenerateRequest = {
            model,
            prompt: buildAnalyzeRetryPrompt(prompt),
            format: 'json',
            options
          };
          if (signal !== undefined) retryArgs.signal = signal;
          const retryRaw = await client.generate(baseUrl, retryArgs);
          rawOutputs.push(retryRaw);
          parsed = parseAnalysisResponse(retryRaw, transcript.id, model);
        } catch (retryErr) {
          logger.warn('analyze: retry failed, accepting empty fallback', String(retryErr));
          hadFallback = true;
          parsed = {
            schemaVersion: 1,
            transcriptId: transcript.id,
            model,
            generatedAt: new Date().toISOString(),
            actionItems: [],
            decisions: [],
            keyDates: [],
            openQuestions: []
          };
        }
      } else {
        throw err;
      }
    }
    partials.push(parsed);
  }

  const merged = mergeAnalyses(partials);
  const result: Analysis = {
    schemaVersion: 1,
    transcriptId: transcript.id,
    model,
    generatedAt: new Date().toISOString(),
    actionItems: merged.actionItems,
    decisions: merged.decisions,
    keyDates: merged.keyDates,
    openQuestions: merged.openQuestions
  };
  if (hadFallback) {
    result.rawModelOutput = rawOutputs.join('\n\n---\n\n');
  }
  return result;
}
