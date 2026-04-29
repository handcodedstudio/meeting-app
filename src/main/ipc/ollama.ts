import { ipcMain, type WebContents } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type {
  OllamaHealth,
  OllamaPullReq,
  OkRes,
  OllamaPullProgressPayload
} from '@shared/types/ipc';
import { getSettings } from '../services/settings.js';
import { health, pullModel } from '../services/ollamaClient.js';
import { logger } from '../services/logger.js';

async function handleHealth(): Promise<OllamaHealth> {
  try {
    const settings = await getSettings();
    const result = await health(settings.ollamaUrl);
    const out: OllamaHealth = { running: result.running, models: result.models };
    if (result.version !== undefined) out.version = result.version;
    return out;
  } catch (err) {
    logger.error('ollama:health failed', err);
    return { running: false, models: [] };
  }
}

async function handlePullModel(
  e: { sender: WebContents },
  req: OllamaPullReq
): Promise<OkRes> {
  try {
    const settings = await getSettings();
    await pullModel(settings.ollamaUrl, req.model, {
      onProgress: ({ percent, status }) => {
        const payload: OllamaPullProgressPayload = { model: req.model, percent, status };
        if (!e.sender.isDestroyed()) e.sender.send(IPC.OLLAMA_PULL_PROGRESS, payload);
      }
    });
    return { ok: true };
  } catch (err) {
    logger.error('ollama:pullModel failed', err);
    throw err;
  }
}

export function registerOllamaHandlers(): void {
  ipcMain.handle(IPC.OLLAMA_HEALTH, handleHealth);
  ipcMain.handle(IPC.OLLAMA_PULL_MODEL, handlePullModel);
}
