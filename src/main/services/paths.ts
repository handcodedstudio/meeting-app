import { app } from 'electron';
import { join } from 'node:path';
import type { WhisperModelSize } from '@shared/types/transcript';

function resourcesRoot(): string {
  // In production, electron-builder unpacks extraResources next to the app bundle
  // and exposes them via process.resourcesPath. In dev, we serve from the repo's
  // resources/ folder.
  return app.isPackaged ? process.resourcesPath : join(process.cwd(), 'resources');
}

export function getPythonExecutable(): string {
  return join(resourcesRoot(), 'python', 'bin', 'python');
}

export function getSidecarSourceDir(): string {
  return join(resourcesRoot(), 'python', 'app');
}

export function getWhisperModelDir(size: WhisperModelSize): string {
  return join(resourcesRoot(), 'models', 'whisper', size);
}

export function getWhisperRoot(): string {
  return join(resourcesRoot(), 'models', 'whisper');
}

export function getPythonRoot(): string {
  return join(resourcesRoot(), 'python');
}

export function isResourceRemovable(): boolean {
  // Inside a packaged .app, process.resourcesPath is read-only at runtime — we
  // can't safely rm -rf the bundle. In dev, we delete from the repo's resources/.
  return !app.isPackaged;
}

export function getTranscriptsDir(): string {
  return join(app.getPath('userData'), 'transcripts');
}

export function getTranscriptDir(id: string): string {
  return join(getTranscriptsDir(), id);
}

export function getPyannoteCacheDir(): string {
  return join(app.getPath('userData'), 'models', 'pyannote');
}

export function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function getLogsDir(): string {
  return join(app.getPath('userData'), 'logs');
}
