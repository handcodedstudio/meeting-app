import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { WhisperModelSize } from '@shared/types/transcript';

function resourcesRoot(): string {
  // In production, electron-builder unpacks extraResources next to the app bundle
  // and exposes them via process.resourcesPath. In dev, we serve from the repo's
  // resources/ folder.
  return app.isPackaged ? process.resourcesPath : join(process.cwd(), 'resources');
}

export function getWhisperModelPath(size: WhisperModelSize): string {
  // smart-whisper expects a single .bin GGML file. We keep them flat under
  // resources/models/whisper/. Prefer a quantized variant when present —
  // ~2x faster than F16 with negligible quality loss. Quantization scheme
  // varies by model: small.en uses q5_1, medium.en uses q5_0, etc.
  const dir = join(resourcesRoot(), 'models', 'whisper');
  for (const suffix of ['-q5_0', '-q5_1', '-q8_0']) {
    const candidate = join(dir, `ggml-${size}${suffix}.bin`);
    if (existsSync(candidate)) return candidate;
  }
  return join(dir, `ggml-${size}.bin`);
}

export function getWhisperRoot(): string {
  return join(resourcesRoot(), 'models', 'whisper');
}

export function getDiarizationModelDir(): string {
  return join(resourcesRoot(), 'models', 'diarization');
}

export function getDiarizationSegmentationModel(): string {
  return join(getDiarizationModelDir(), 'segmentation.onnx');
}

export function getDiarizationEmbeddingModel(): string {
  return join(getDiarizationModelDir(), 'embedding.onnx');
}

export function getVadModelPath(): string {
  // Lives alongside the diarization models so the existing resources card and
  // delete flow cover it.
  return join(getDiarizationModelDir(), 'silero_vad.onnx');
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

export function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function getLogsDir(): string {
  return join(app.getPath('userData'), 'logs');
}
