import { z } from 'zod';

export const wordSchema = z.object({
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  confidence: z.number().optional(),
  speaker: z.string().optional()
});

export const speakerTurnSchema = z.object({
  speaker: z.string(),
  displayName: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  text: z.string(),
  words: z.array(wordSchema)
});

export const speakerEntrySchema = z.object({
  id: z.string(),
  displayName: z.string()
});

export const transcriptSchema = z.object({
  id: z.string(),
  schemaVersion: z.literal(1),
  title: z.string(),
  sourceFile: z.object({
    originalPath: z.string(),
    importedAt: z.string(),
    sizeBytes: z.number().nonnegative(),
    mime: z.string()
  }),
  audio: z.object({
    durationSec: z.number().nonnegative(),
    sampleRate: z.number().optional()
  }),
  language: z.string(),
  modelSize: z.string(),
  diarization: z.object({
    backend: z.literal('pyannote-3.1'),
    minSpeakers: z.number().optional(),
    maxSpeakers: z.number().optional()
  }),
  speakers: z.array(speakerEntrySchema),
  turns: z.array(speakerTurnSchema),
  stats: z.object({
    speakerCount: z.number().nonnegative(),
    wordCount: z.number().nonnegative(),
    turnCount: z.number().nonnegative()
  }),
  createdAt: z.string(),
  updatedAt: z.string()
});

const itemBase = z.object({
  id: z.string(),
  description: z.string(),
  sourceTurnIndex: z.number().int().nonnegative().optional()
});

export const analysisSchema = z.object({
  schemaVersion: z.literal(1),
  transcriptId: z.string(),
  model: z.string(),
  generatedAt: z.string(),
  actionItems: z.array(itemBase.extend({ assignee: z.string().optional(), dueDate: z.string().optional() })),
  decisions: z.array(itemBase),
  keyDates: z.array(itemBase.extend({ date: z.string().optional() })),
  openQuestions: z.array(itemBase),
  rawModelOutput: z.string().optional()
});

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  createdAt: z.string(),
  model: z.string().optional(),
  errored: z.boolean().optional()
});

export const chatHistorySchema = z.object({
  schemaVersion: z.literal(1),
  transcriptId: z.string(),
  messages: z.array(chatMessageSchema)
});

export const settingsSchema = z.object({
  schemaVersion: z.literal(1),
  ollamaUrl: z.string().url(),
  ollamaModel: z.string().min(1),
  whisperModelSize: z.string(),
  language: z.enum(['en', 'auto']),
  theme: z.enum(['system', 'light', 'dark']),
  autoPullOllamaModel: z.boolean(),
  huggingfaceToken: z.string().optional()
});
