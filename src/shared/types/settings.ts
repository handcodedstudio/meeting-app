import type { WhisperModelSize } from './transcript';

export interface AppSettings {
  schemaVersion: 1;
  ollamaUrl: string;
  ollamaModel: string;
  whisperModelSize: WhisperModelSize;
  language: 'en' | 'auto';
  theme: 'system' | 'light' | 'dark';
  autoPullOllamaModel: boolean;
  /** HuggingFace token used to download gated pyannote weights on first run. */
  huggingfaceToken?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.1:8b',
  whisperModelSize: 'small.en',
  language: 'en',
  theme: 'system',
  autoPullOllamaModel: true
};
