#!/usr/bin/env node
// Fetch the sherpa-onnx ONNX models needed for offline speaker diarization:
//   - segmentation: pyannote/segmentation-3.0 (~6 MB)
//   - embedding:    NeMo TitaNet small EN (~28 MB)
// Land them under resources/models/diarization/.

import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { spawn } from 'node:child_process';

const SEGMENTATION_TAR =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2';
const SEGMENTATION_INNER = 'sherpa-onnx-pyannote-segmentation-3-0/model.onnx';
const SEGMENTATION_OUT = 'segmentation.onnx';

const EMBEDDING_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_small.onnx';
const EMBEDDING_OUT = 'embedding.onnx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const DIAR_DIR = join(REPO_ROOT, 'resources', 'models', 'diarization');
const MARKER = join(DIAR_DIR, '.installed');
const MARKER_VALUE = 'pyannote-seg-3.0+titanet-small@v1';

const log = (...args) => console.log('[fetch-sherpa-models]', ...args);

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readMarker() {
  try {
    return (await readFile(MARKER, 'utf8')).trim();
  } catch {
    return null;
  }
}

async function download(url, destPath) {
  log('downloading', url);
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'transcription-app-build' }
  });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: HTTP ${res.status} for ${url}`);
  }
  const total = Number(res.headers.get('content-length') ?? 0);
  let received = 0;
  let lastLog = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (total && Date.now() - lastLog > 1000) {
        const pct = ((received / total) * 100).toFixed(1);
        log(`  ${pct}% (${received}/${total})`);
        lastLog = Date.now();
      }
      cb(null, chunk);
    }
  });
  await mkdir(dirname(destPath), { recursive: true });
  const reader = Readable.fromWeb(res.body);
  try {
    await pipeline(reader, counter, createWriteStream(destPath));
  } catch (err) {
    await unlink(destPath).catch(() => undefined);
    throw err;
  }
}

function extractTarBz2(tarPath, destDir, innerPath) {
  // Use system `tar` to avoid bringing the npm tar dep back in. macOS tar
  // handles bz2 transparently. We only need one specific file out.
  return new Promise((res, rej) => {
    const proc = spawn('tar', ['-xjf', tarPath, '-C', destDir, innerPath], {
      stdio: ['ignore', 'inherit', 'inherit']
    });
    proc.on('error', rej);
    proc.on('exit', (code) => (code === 0 ? res() : rej(new Error(`tar exited ${code}`))));
  });
}

async function fetchSegmentation() {
  const tmpTar = join(DIAR_DIR, 'segmentation.tar.bz2');
  const extractedRoot = join(DIAR_DIR, 'sherpa-onnx-pyannote-segmentation-3-0');
  const finalPath = join(DIAR_DIR, SEGMENTATION_OUT);
  if (await pathExists(finalPath)) return;

  await download(SEGMENTATION_TAR, tmpTar);
  await extractTarBz2(tmpTar, DIAR_DIR, SEGMENTATION_INNER);
  // Move the inner model.onnx up one level so paths stay simple.
  const { rename, rm } = await import('node:fs/promises');
  await rename(join(DIAR_DIR, SEGMENTATION_INNER), finalPath);
  await rm(extractedRoot, { recursive: true, force: true });
  await unlink(tmpTar).catch(() => undefined);
}

async function fetchEmbedding() {
  const finalPath = join(DIAR_DIR, EMBEDDING_OUT);
  if (await pathExists(finalPath)) return;
  await download(EMBEDDING_URL, finalPath);
}

async function main() {
  const current = await readMarker();
  if (
    current === MARKER_VALUE &&
    (await pathExists(join(DIAR_DIR, SEGMENTATION_OUT))) &&
    (await pathExists(join(DIAR_DIR, EMBEDDING_OUT)))
  ) {
    log('already installed; skipping.');
    return;
  }

  await mkdir(DIAR_DIR, { recursive: true });
  await fetchSegmentation();
  await fetchEmbedding();
  await writeFile(MARKER, MARKER_VALUE, 'utf8');
  log('done.');
}

main().catch((err) => {
  console.error('[fetch-sherpa-models] failed:', err);
  process.exit(1);
});
