import { readFile } from 'node:fs/promises';
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types/settings';
import { settingsSchema } from '@shared/zod-schemas';
import { getSettingsPath } from './paths.js';
import { atomicWriteJson } from '../utils/atomicWrite.js';
import { logger } from './logger.js';

let cached: AppSettings | null = null;
let inflight: Promise<AppSettings> | null = null;

function validate(input: unknown): AppSettings {
  const parsed = settingsSchema.parse(input);
  // Whisper is locked to medium.en; coerce stale values from older builds.
  if (parsed.whisperModelSize !== 'medium.en') {
    parsed.whisperModelSize = 'medium.en';
  }
  return parsed as unknown as AppSettings;
}

async function loadFromDisk(): Promise<AppSettings> {
  const file = getSettingsPath();
  try {
    const raw = await readFile(file, 'utf8');
    return validate(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Settings file invalid or unreadable, falling back to defaults', {
        error: String(err)
      });
    }
    // Don't persist on first read — that races when multiple callers fire
    // getSettings() concurrently at startup. Defaults stay in memory until
    // the user explicitly mutates a field via setSettings().
    return { ...DEFAULT_SETTINGS };
  }
}

export async function getSettings(): Promise<AppSettings> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = loadFromDisk().then((s) => {
    cached = s;
    inflight = null;
    return s;
  });
  return inflight;
}

export async function setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const merged = { ...current, ...patch, schemaVersion: 1 as const };
  const validated = validate(merged);
  await atomicWriteJson(getSettingsPath(), validated);
  cached = validated;
  return validated;
}
