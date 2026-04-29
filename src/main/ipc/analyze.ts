import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type { AnalyzeRunReq } from '@shared/types/ipc';
import type { Analysis } from '@shared/types/analysis';
import { loadTranscript, saveAnalysis } from '../services/storage.js';
import { getSettings } from '../services/settings.js';
import { runAnalyze } from '../prompts/analyze.js';
import { assertUlid } from '../utils/ulid.js';
import { logger } from '../services/logger.js';

async function handleRun(_e: unknown, req: AnalyzeRunReq): Promise<Analysis> {
  try {
    const id = assertUlid(req?.id, 'transcript id');
    const transcript = await loadTranscript(id);
    if (!transcript) throw new Error(`Transcript not found: ${id}`);
    const settings = await getSettings();
    const model = req.model ?? settings.ollamaModel;
    const baseUrl = settings.ollamaUrl;
    if (!transcript.turns || transcript.turns.length === 0) {
      // Avoid sending an empty prompt to Ollama (causes llama.cpp's
      // [json.exception.parse_error.101] noise). Persist an empty analysis instead.
      const empty: Analysis = {
        schemaVersion: 1,
        transcriptId: id,
        model,
        generatedAt: new Date().toISOString(),
        actionItems: [],
        decisions: [],
        keyDates: [],
        openQuestions: []
      };
      await saveAnalysis(empty);
      return empty;
    }
    const analysis = await runAnalyze({ transcript, model, baseUrl });
    await saveAnalysis(analysis);
    return analysis;
  } catch (err) {
    logger.error('analyze:run failed', err);
    throw err;
  }
}

export function registerAnalyzeHandlers(): void {
  ipcMain.handle(IPC.ANALYZE_RUN, handleRun);
}
