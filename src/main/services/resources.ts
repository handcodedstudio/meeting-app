import type { Dirent } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  getPyannoteCacheDir,
  getPythonRoot,
  getWhisperRoot,
  isResourceRemovable
} from './paths.js';
import { logger } from './logger.js';

export type ResourceKind = 'pyannote' | 'whisper' | 'python';

export interface ResourceInfo {
  kind: ResourceKind;
  label: string;
  path: string;
  exists: boolean;
  sizeBytes: number;
  removable: boolean;
  reasonNotRemovable?: string;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true, encoding: 'utf8' })) as Dirent[];
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else if (entry.isFile()) {
      try {
        const s = await stat(full);
        total += s.size;
      } catch {
        // ignore unreadable file
      }
    }
  }
  return total;
}

function describe(kind: ResourceKind): { label: string; path: string; alwaysRemovable: boolean } {
  switch (kind) {
    case 'pyannote':
      // Always under userData and always safe to remove (re-downloaded on next transcribe).
      return { label: 'Speaker diarization (pyannote)', path: getPyannoteCacheDir(), alwaysRemovable: true };
    case 'whisper':
      return { label: 'Whisper transcription model', path: getWhisperRoot(), alwaysRemovable: false };
    case 'python':
      return { label: 'Python sidecar runtime', path: getPythonRoot(), alwaysRemovable: false };
  }
}

async function infoFor(kind: ResourceKind): Promise<ResourceInfo> {
  const { label, path, alwaysRemovable } = describe(kind);
  const exists = await pathExists(path);
  const sizeBytes = exists ? await dirSize(path) : 0;
  const removable = alwaysRemovable || isResourceRemovable();
  const out: ResourceInfo = { kind, label, path, exists, sizeBytes, removable };
  if (!removable) {
    out.reasonNotRemovable =
      'Bundled inside the packaged app — reinstall the app to reset this resource.';
  }
  return out;
}

export async function listResources(): Promise<ResourceInfo[]> {
  return Promise.all((['pyannote', 'whisper', 'python'] as const).map((k) => infoFor(k)));
}

export async function deleteResource(kind: ResourceKind): Promise<ResourceInfo> {
  const info = await infoFor(kind);
  if (!info.removable) {
    throw new Error(info.reasonNotRemovable ?? 'Resource is not removable.');
  }
  if (!info.exists) {
    return info;
  }
  logger.info('Deleting resource', kind, info.path);
  await rm(info.path, { recursive: true, force: true });
  return infoFor(kind);
}
