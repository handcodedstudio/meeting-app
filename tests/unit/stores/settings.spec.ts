import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { AppSettings } from '../../../src/shared/types/settings';
import { DEFAULT_SETTINGS } from '../../../src/shared/types/settings';
import type { RendererApi } from '../../../src/shared/types/ipc';

function installApi(api: Partial<RendererApi>) {
  Object.defineProperty(window, 'api', {
    value: api,
    writable: true,
    configurable: true
  });
}

describe('useSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('load() populates settings from window.api.settingsGet', async () => {
    const fromMain: AppSettings = {
      ...DEFAULT_SETTINGS,
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.1:8b'
    };
    installApi({ settingsGet: vi.fn().mockResolvedValue(fromMain) });
    const { useSettingsStore } = await import('../../../src/renderer/src/stores/settings');
    const store = useSettingsStore();
    await store.load();
    expect(store.settings.ollamaUrl).toBe('http://localhost:11434');
    expect(store.settings.ollamaModel).toBe('llama3.1:8b');
    expect(store.error).toBeNull();
  });

  it('load() captures errors without throwing', async () => {
    installApi({ settingsGet: vi.fn().mockRejectedValue(new Error('nope')) });
    const { useSettingsStore } = await import('../../../src/renderer/src/stores/settings');
    const store = useSettingsStore();
    await store.load();
    expect(store.error).toBe('nope');
  });

  it('save() validates first then commits via window.api.settingsSet', async () => {
    const updated: AppSettings = { ...DEFAULT_SETTINGS, ollamaModel: 'llama3.1:70b' };
    const settingsSet = vi.fn().mockResolvedValue(updated);
    installApi({ settingsSet });
    const { useSettingsStore } = await import('../../../src/renderer/src/stores/settings');
    const store = useSettingsStore();
    await store.save({ ollamaModel: 'llama3.1:70b' });
    expect(settingsSet).toHaveBeenCalledWith({ ollamaModel: 'llama3.1:70b' });
    expect(store.settings.ollamaModel).toBe('llama3.1:70b');
  });

  it('save() does not call settingsSet when validation fails', async () => {
    const settingsSet = vi.fn().mockResolvedValue(DEFAULT_SETTINGS);
    installApi({ settingsSet });
    const { useSettingsStore } = await import('../../../src/renderer/src/stores/settings');
    const store = useSettingsStore();
    await store.save({ ollamaUrl: 'not a url' });
    expect(settingsSet).not.toHaveBeenCalled();
    expect(store.validation.ollamaUrl).toBeTruthy();
  });

  it('validate() flags invalid Ollama URLs', async () => {
    installApi({});
    const { useSettingsStore } = await import('../../../src/renderer/src/stores/settings');
    const store = useSettingsStore();
    expect(store.validate({ ollamaUrl: 'not a url' })).toBe(false);
    expect(typeof store.validation.ollamaUrl).toBe('string');
    expect(store.validation.ollamaUrl?.length).toBeGreaterThan(0);
  });

  it('validate() rejects non-http(s) URLs', async () => {
    installApi({});
    const { useSettingsStore } = await import('../../../src/renderer/src/stores/settings');
    const store = useSettingsStore();
    expect(store.validate({ ollamaUrl: 'ftp://example.com' })).toBe(false);
  });

  it('validate() flags an empty Ollama model name', async () => {
    installApi({});
    const { useSettingsStore } = await import('../../../src/renderer/src/stores/settings');
    const store = useSettingsStore();
    expect(store.validate({ ollamaModel: '   ' })).toBe(false);
    expect(store.validation.ollamaModel).toBeTruthy();
  });

  it('validate() returns true and clears prior errors when input is valid', async () => {
    installApi({});
    const { useSettingsStore } = await import('../../../src/renderer/src/stores/settings');
    const store = useSettingsStore();
    expect(store.validate({ ollamaUrl: 'bad' })).toBe(false);
    expect(store.validate({ ollamaUrl: 'http://localhost:11434', ollamaModel: 'llama3.1:8b' })).toBe(
      true
    );
    expect(store.validation.ollamaUrl).toBeUndefined();
    expect(store.validation.ollamaModel).toBeUndefined();
  });
});
