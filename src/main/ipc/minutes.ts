import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type { MinutesRunReq } from '@shared/types/ipc';
import type { Minutes } from '@shared/types/analysis';
import { loadTranscript, saveMinutes } from '../services/storage.js';
import { getSettings } from '../services/settings.js';
import { runMinutes } from '../prompts/minutes.js';
import { assertUlid } from '../utils/ulid.js';
import { logger } from '../services/logger.js';

async function handleRun(_e: unknown, req: MinutesRunReq): Promise<Minutes> {
  try {
    const id = assertUlid(req?.id, 'transcript id');
    const transcript = await loadTranscript(id);
    if (!transcript) throw new Error(`Transcript not found: ${id}`);
    const settings = await getSettings();
    const model = req.model ?? settings.ollamaModel;
    const baseUrl = settings.ollamaUrl;
    const template = (settings.minutesTemplate ?? '').trim();
    if (template.length === 0) {
      throw new Error('No minutes template configured. Set one in Settings → Minutes.');
    }
    if (!transcript.turns || transcript.turns.length === 0) {
      const empty: Minutes = {
        schemaVersion: 1,
        transcriptId: id,
        model,
        generatedAt: new Date().toISOString(),
        template,
        content: ''
      };
      await saveMinutes(empty);
      return empty;
    }
    const minutes = await runMinutes({ transcript, template, model, baseUrl });
    await saveMinutes(minutes);
    return minutes;
  } catch (err) {
    logger.error('minutes:run failed', err);
    throw err;
  }
}

export function registerMinutesHandlers(): void {
  ipcMain.handle(IPC.MINUTES_RUN, handleRun);
}
