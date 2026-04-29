import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AppSettings } from '@shared/types/settings';
import { DEFAULT_SETTINGS } from '@shared/types/settings';

export function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS });
  const loading = ref(false);
  const error = ref<string | null>(null);
  const validation = ref<Partial<Record<keyof AppSettings, string>>>({});

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      settings.value = await window.api.settingsGet();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  function validate(patch: Partial<AppSettings>): boolean {
    const errs: Partial<Record<keyof AppSettings, string>> = {};
    if (patch.ollamaUrl !== undefined && !isValidUrl(patch.ollamaUrl)) {
      errs.ollamaUrl = 'Must be a valid http(s) URL';
    }
    if (patch.ollamaModel !== undefined && patch.ollamaModel.trim() === '') {
      errs.ollamaModel = 'Model name is required';
    }
    validation.value = errs;
    return Object.keys(errs).length === 0;
  }

  async function save(patch: Partial<AppSettings>) {
    if (!validate(patch)) return;
    error.value = null;
    try {
      settings.value = await window.api.settingsSet(patch);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  return { settings, loading, error, validation, load, save, validate };
});
