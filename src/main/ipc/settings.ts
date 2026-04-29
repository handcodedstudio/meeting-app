import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type { AppSettings } from '@shared/types/settings';
import { getSettings, setSettings } from '../services/settings.js';
import { logger } from '../services/logger.js';

async function handleGet(): Promise<AppSettings> {
  try {
    return await getSettings();
  } catch (err) {
    logger.error('settings:get failed', err);
    throw err;
  }
}

async function handleSet(_e: unknown, patch: Partial<AppSettings>): Promise<AppSettings> {
  try {
    return await setSettings(patch);
  } catch (err) {
    logger.error('settings:set failed', err);
    throw err;
  }
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, handleGet);
  ipcMain.handle(IPC.SETTINGS_SET, handleSet);
}
