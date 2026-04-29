import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getPyannoteCacheDir } from './paths.js';
import { logger } from './logger.js';

export interface PyannoteEnsureProgress {
  percent: number;
  status: string;
}

export interface PyannoteEnsureResult {
  ready: true;
  cachedAt: string;
}

export interface PyannoteEnsureOpts {
  token?: string;
  onProgress?: (p: PyannoteEnsureProgress) => void;
}

// pyannote/speaker-diarization-3.1 references segmentation-3.0 + wespeaker. We
// pre-stage the pipeline config locally; the embedded sub-models are cached by
// huggingface_hub on first run inside the sidecar (same cache dir).
const PYANNOTE_REPO = 'pyannote/speaker-diarization-3.1';
const PYANNOTE_REVISION = 'main';
const PYANNOTE_FILES = ['config.yaml', 'handler.py', 'README.md'];

const HF_AUTH_HINT =
  'Pyannote weights are gated. Accept the licence at ' +
  'https://huggingface.co/pyannote/speaker-diarization-3.1 and add a HuggingFace ' +
  'access token in Settings before retrying.';

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function snapshotsDir(cacheRoot: string): string {
  // Mirror the layout huggingface_hub uses so the sidecar finds the same files.
  const safe = `models--${PYANNOTE_REPO.replace(/\//g, '--')}`;
  return join(cacheRoot, 'hub', safe, 'snapshots', PYANNOTE_REVISION);
}

interface HfFileMeta {
  path: string;
  size: number | null;
}

async function listRepoFiles(token?: string): Promise<HfFileMeta[]> {
  const url = `https://huggingface.co/api/models/${PYANNOTE_REPO}/tree/${PYANNOTE_REVISION}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'transcription-app'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Unauthorised to read ${PYANNOTE_REPO} from HuggingFace. ${HF_AUTH_HINT}`);
  }
  if (!res.ok) {
    throw new Error(`HuggingFace API error ${res.status} listing ${PYANNOTE_REPO}`);
  }
  const json = (await res.json()) as Array<{ type: string; path: string; size?: number }>;
  return json
    .filter((entry) => entry.type === 'file')
    .map((entry) => ({ path: entry.path, size: entry.size ?? null }));
}

async function downloadOne(
  filePath: string,
  destPath: string,
  expectedSize: number | null,
  token: string | undefined,
  onChunk: (delta: number) => void
): Promise<void> {
  const url = `https://huggingface.co/${PYANNOTE_REPO}/resolve/${PYANNOTE_REVISION}/${filePath}`;
  const headers: Record<string, string> = { 'User-Agent': 'transcription-app' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Unauthorised to download ${filePath}. ${HF_AUTH_HINT}`);
  }
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${filePath}: HTTP ${res.status}`);
  }

  await mkdir(dirname(destPath), { recursive: true });
  const tmpPath = `${destPath}.part`;
  let received = 0;
  // Progress goes through a Transform inside the pipeline. A side-channel
  // 'data' listener on the Readable would put it in flowing mode and race the
  // sink (we hit this with the whisper fetch script — small files ended empty).
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      onChunk(chunk.length);
      cb(null, chunk);
    }
  });
  const reader = Readable.fromWeb(res.body);
  try {
    await pipeline(reader, counter, createWriteStream(tmpPath));
  } catch (err) {
    await unlink(tmpPath).catch(() => undefined);
    throw err;
  }

  if (expectedSize != null && expectedSize > 0 && received !== expectedSize) {
    const corrupt = `${tmpPath}.corrupt-${Date.now()}`;
    await rename(tmpPath, corrupt).catch(() => undefined);
    throw new Error(
      `Size mismatch for ${filePath}: expected ${expectedSize}, received ${received}. Quarantined to ${corrupt}.`
    );
  }
  await rename(tmpPath, destPath);
}

export async function ensurePyannoteWeights(
  opts: PyannoteEnsureOpts = {}
): Promise<PyannoteEnsureResult> {
  const cacheRoot = getPyannoteCacheDir();
  await mkdir(cacheRoot, { recursive: true });
  const snapDir = snapshotsDir(cacheRoot);

  const allConfigPresent = (
    await Promise.all(PYANNOTE_FILES.map((f) => pathExists(join(snapDir, f))))
  ).every(Boolean);
  if (allConfigPresent) {
    logger.info('pyannote: cache already populated', { snapDir });
    return { ready: true, cachedAt: snapDir };
  }

  const token = opts.token?.trim();
  if (!token) {
    throw new Error(`HuggingFace token missing. ${HF_AUTH_HINT}`);
  }

  opts.onProgress?.({ percent: 0, status: 'listing pyannote files' });
  const files = await listRepoFiles(token);
  const totalBytes = files.reduce((acc, f) => acc + (f.size ?? 0), 0);
  let downloaded = 0;

  for (const file of files) {
    const dest = join(snapDir, file.path);
    if (await pathExists(dest)) {
      downloaded += file.size ?? 0;
      const pct = totalBytes > 0 ? (downloaded / totalBytes) * 100 : 100;
      opts.onProgress?.({ percent: pct, status: `cached ${file.path}` });
      continue;
    }
    opts.onProgress?.({
      percent: totalBytes > 0 ? (downloaded / totalBytes) * 100 : 0,
      status: `downloading ${file.path}`
    });
    await downloadOne(file.path, dest, file.size, token, (delta) => {
      downloaded += delta;
      if (totalBytes > 0) {
        const pct = Math.min(99.9, (downloaded / totalBytes) * 100);
        opts.onProgress?.({ percent: pct, status: `downloading ${file.path}` });
      }
    });
  }

  // Marker so the next run can short-circuit the API call.
  await writeFile(
    join(cacheRoot, '.installed'),
    `${PYANNOTE_REPO}@${PYANNOTE_REVISION}\n`,
    'utf8'
  );

  opts.onProgress?.({ percent: 100, status: 'pyannote ready' });
  logger.info('pyannote: weights ready', { snapDir });
  return { ready: true, cachedAt: snapDir };
}
