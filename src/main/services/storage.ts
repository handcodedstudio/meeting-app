import { mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  transcriptSchema,
  analysisSchema,
  chatHistorySchema,
  minutesSchema
} from '@shared/zod-schemas';
import type { Transcript, TranscriptSummary } from '@shared/types/transcript';
import type { Analysis, Minutes } from '@shared/types/analysis';
import type { ChatHistory } from '@shared/types/chat';
import { getTranscriptDir, getTranscriptsDir } from './paths.js';
import { atomicWriteJson } from '../utils/atomicWrite.js';
import { logger } from './logger.js';

const TRANSCRIPT_FILE = 'transcript.json';
const ANALYSIS_FILE = 'analysis.json';
const MINUTES_FILE = 'minutes.json';
const CHAT_FILE = 'chat.json';

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function quarantineCorrupt(path: string, error: unknown): Promise<void> {
  const ts = Date.now();
  const target = `${path}.corrupt-${ts}`;
  try {
    await rename(path, target);
    logger.error('Quarantined corrupt file', { path, target, error: String(error) });
  } catch (renameErr) {
    logger.error('Failed to quarantine corrupt file', { path, error: String(renameErr) });
  }
}

async function readJsonValidated<T>(
  filePath: string,
  schema: { parse: (input: unknown) => T }
): Promise<T | null> {
  if (!(await pathExists(filePath))) return null;
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (err) {
    logger.error('Failed to read file', { filePath, error: String(err) });
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    await quarantineCorrupt(filePath, err);
    return null;
  }
  try {
    return schema.parse(parsed);
  } catch (err) {
    await quarantineCorrupt(filePath, err);
    return null;
  }
}

export async function loadTranscript(id: string): Promise<Transcript | null> {
  const file = join(getTranscriptDir(id), TRANSCRIPT_FILE);
  return readJsonValidated<Transcript>(file, transcriptSchema as unknown as {
    parse: (input: unknown) => Transcript;
  });
}

export async function loadAnalysis(id: string): Promise<Analysis | null> {
  const file = join(getTranscriptDir(id), ANALYSIS_FILE);
  return readJsonValidated<Analysis>(file, analysisSchema as unknown as {
    parse: (input: unknown) => Analysis;
  });
}

export async function loadMinutes(id: string): Promise<Minutes | null> {
  const file = join(getTranscriptDir(id), MINUTES_FILE);
  return readJsonValidated<Minutes>(file, minutesSchema as unknown as {
    parse: (input: unknown) => Minutes;
  });
}

export async function saveMinutes(m: Minutes): Promise<Minutes> {
  const file = join(getTranscriptDir(m.transcriptId), MINUTES_FILE);
  await atomicWriteJson(file, m);
  return m;
}

export async function loadChat(id: string): Promise<ChatHistory | null> {
  const file = join(getTranscriptDir(id), CHAT_FILE);
  return readJsonValidated<ChatHistory>(file, chatHistorySchema as unknown as {
    parse: (input: unknown) => ChatHistory;
  });
}

export async function saveTranscript(t: Transcript): Promise<Transcript> {
  const next: Transcript = { ...t, updatedAt: new Date().toISOString() };
  const file = join(getTranscriptDir(next.id), TRANSCRIPT_FILE);
  await atomicWriteJson(file, next);
  return next;
}

export async function saveAnalysis(a: Analysis): Promise<Analysis> {
  const file = join(getTranscriptDir(a.transcriptId), ANALYSIS_FILE);
  await atomicWriteJson(file, a);
  return a;
}

export async function saveChat(c: ChatHistory): Promise<ChatHistory> {
  const file = join(getTranscriptDir(c.transcriptId), CHAT_FILE);
  await atomicWriteJson(file, c);
  return c;
}

export async function deleteTranscript(id: string): Promise<void> {
  const dir = getTranscriptDir(id);
  await rm(dir, { recursive: true, force: true });
}

function summarize(t: Transcript): TranscriptSummary {
  return {
    id: t.id,
    title: t.title,
    durationSec: t.audio.durationSec,
    speakerCount: t.stats.speakerCount,
    createdAt: t.createdAt
  };
}

export async function listTranscripts(): Promise<TranscriptSummary[]> {
  const root = getTranscriptsDir();
  await mkdir(root, { recursive: true });
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (err) {
    logger.error('Failed to list transcripts dir', { root, error: String(err) });
    return [];
  }

  const summaries: TranscriptSummary[] = [];
  for (const entry of entries) {
    const dir = join(root, entry);
    let s;
    try {
      s = await stat(dir);
    } catch {
      continue;
    }
    if (!s.isDirectory()) continue;
    const transcript = await loadTranscript(entry);
    if (transcript) summaries.push(summarize(transcript));
  }
  summaries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return summaries;
}
