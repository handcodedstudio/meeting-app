import { registerTranscriptsHandlers } from './transcripts.js';
import { registerTranscribeHandlers } from './transcribe.js';
import { registerAnalyzeHandlers } from './analyze.js';
import { registerChatHandlers } from './chat.js';
import { registerOllamaHandlers } from './ollama.js';
import { registerSidecarHandlers } from './sidecar.js';
import { registerSettingsHandlers } from './settings.js';
import { registerFsHandlers } from './fs.js';
import { registerResourcesHandlers } from './resources.js';
import { logger } from '../services/logger.js';

export function registerIpcHandlers(): void {
  registerTranscriptsHandlers();
  registerTranscribeHandlers();
  registerAnalyzeHandlers();
  registerChatHandlers();
  registerOllamaHandlers();
  registerSidecarHandlers();
  registerSettingsHandlers();
  registerFsHandlers();
  registerResourcesHandlers();
  logger.info('All IPC handlers registered.');
}
