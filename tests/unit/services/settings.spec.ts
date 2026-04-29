import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol, fs as memfs } from 'memfs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, type AppSettings } from '../../../src/shared/types/settings';

const USER_DATA = '/tmp/test-userdata-settings';
const SETTINGS_PATH = join(USER_DATA, 'settings.json');

vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => USER_DATA,
    isPackaged: false
  }
}));

vi.mock('node:fs', () => ({ ...memfs, default: memfs }));
vi.mock('node:fs/promises', () => ({ ...memfs.promises, default: memfs.promises }));

function writeSettingsFile(data: unknown): void {
  memfs.mkdirSync(USER_DATA, { recursive: true });
  memfs.writeFileSync(SETTINGS_PATH, typeof data === 'string' ? data : JSON.stringify(data));
}

describe('settings service', () => {
  beforeEach(() => {
    vol.reset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getSettings() returns DEFAULT_SETTINGS when no file exists', async () => {
    const { getSettings } = await import('../../../src/main/services/settings');
    const result = await getSettings();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('getSettings() does not persist defaults on first read (avoids startup race)', async () => {
    const { getSettings } = await import('../../../src/main/services/settings');
    await getSettings();
    expect(memfs.existsSync(SETTINGS_PATH)).toBe(false);
  });

  it('getSettings() reads and validates an existing settings file', async () => {
    const stored: AppSettings = {
      ...DEFAULT_SETTINGS,
      ollamaUrl: 'http://localhost:9999',
      ollamaModel: 'llama3.1:70b',
      theme: 'dark'
    };
    writeSettingsFile(stored);
    const { getSettings } = await import('../../../src/main/services/settings');
    const result = await getSettings();
    expect(result.ollamaUrl).toBe('http://localhost:9999');
    expect(result.ollamaModel).toBe('llama3.1:70b');
    expect(result.theme).toBe('dark');
  });

  it('getSettings() falls back to defaults when the file contains invalid JSON', async () => {
    writeSettingsFile('{not valid json');
    const { getSettings } = await import('../../../src/main/services/settings');
    const result = await getSettings();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('getSettings() falls back to defaults when the file fails schema validation', async () => {
    writeSettingsFile({ schemaVersion: 1, ollamaUrl: 'not a url', ollamaModel: '' });
    const { getSettings } = await import('../../../src/main/services/settings');
    const result = await getSettings();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('getSettings() caches after the first read (no disk re-read)', async () => {
    const stored: AppSettings = { ...DEFAULT_SETTINGS, ollamaModel: 'first' };
    writeSettingsFile(stored);
    const { getSettings } = await import('../../../src/main/services/settings');
    const a = await getSettings();
    expect(a.ollamaModel).toBe('first');
    writeSettingsFile({ ...DEFAULT_SETTINGS, ollamaModel: 'second' });
    const b = await getSettings();
    expect(b.ollamaModel).toBe('first');
  });

  it('getSettings() deduplicates concurrent callers via a single inflight promise', async () => {
    const stored: AppSettings = { ...DEFAULT_SETTINGS, ollamaModel: 'concurrent' };
    writeSettingsFile(stored);
    const { getSettings } = await import('../../../src/main/services/settings');
    const [a, b, c] = await Promise.all([getSettings(), getSettings(), getSettings()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('setSettings() merges patch onto current and writes to disk', async () => {
    const { setSettings, getSettings } = await import('../../../src/main/services/settings');
    const result = await setSettings({ ollamaModel: 'llama3.1:70b', theme: 'light' });
    expect(result.ollamaModel).toBe('llama3.1:70b');
    expect(result.theme).toBe('light');
    expect(result.ollamaUrl).toBe(DEFAULT_SETTINGS.ollamaUrl);
    const onDisk = JSON.parse(memfs.readFileSync(SETTINGS_PATH, 'utf8') as string);
    expect(onDisk.ollamaModel).toBe('llama3.1:70b');
    expect(onDisk.theme).toBe('light');
    const reread = await getSettings();
    expect(reread.ollamaModel).toBe('llama3.1:70b');
  });

  it('setSettings() forces schemaVersion to 1 even if patch tries to override it', async () => {
    const { setSettings } = await import('../../../src/main/services/settings');
    const result = await setSettings({
      schemaVersion: 99 as unknown as 1,
      ollamaModel: 'llama3.1:8b'
    });
    expect(result.schemaVersion).toBe(1);
  });

  it('setSettings() updates the in-memory cache so the next getSettings() reflects the write', async () => {
    const { setSettings, getSettings } = await import('../../../src/main/services/settings');
    await getSettings();
    await setSettings({ ollamaModel: 'cached:value' });
    const after = await getSettings();
    expect(after.ollamaModel).toBe('cached:value');
  });

  it('setSettings() rejects an invalid patch and does not write to disk', async () => {
    const { setSettings } = await import('../../../src/main/services/settings');
    await expect(setSettings({ ollamaUrl: 'not a url' })).rejects.toBeDefined();
    expect(memfs.existsSync(SETTINGS_PATH)).toBe(false);
  });

  it('setSettings() rejects when ollamaModel is an empty string', async () => {
    const { setSettings } = await import('../../../src/main/services/settings');
    await expect(setSettings({ ollamaModel: '' })).rejects.toBeDefined();
  });

  it('setSettings() persists via an atomic temp-and-rename (no .tmp file left behind)', async () => {
    const { setSettings } = await import('../../../src/main/services/settings');
    await setSettings({ ollamaModel: 'llama3.1:70b' });
    const entries = memfs.readdirSync(USER_DATA) as string[];
    expect(entries).toContain('settings.json');
    expect(entries.some((n) => n.endsWith('.tmp'))).toBe(false);
  });
});
