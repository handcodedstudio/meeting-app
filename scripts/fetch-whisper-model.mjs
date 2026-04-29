#!/usr/bin/env node
// Fetch the GGML whisper model used by whisper.cpp / smart-whisper.
// Default: ggml-small.en.bin (~466 MB).
// Lands at resources/models/whisper/ggml-small.en.bin.
// Idempotent via resources/models/.installed marker.

import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';

const MODEL_NAME = process.env.WHISPER_MODEL || 'ggml-small.en.bin';
const MODEL_URL =
  process.env.WHISPER_URL ||
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const MODEL_DIR = join(REPO_ROOT, 'resources', 'models', 'whisper');
const MODEL_PATH = join(MODEL_DIR, MODEL_NAME);
const MARKER = join(REPO_ROOT, 'resources', 'models', '.installed');

const log = (...args) => console.log('[fetch-whisper-model]', ...args);

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

async function main() {
  const expected = MODEL_NAME;
  const current = await readMarker();
  if (current === expected && (await pathExists(MODEL_PATH))) {
    log(`already installed (${expected}); skipping.`);
    return;
  }

  log(`fetching ${MODEL_NAME} -> ${MODEL_PATH}`);
  await mkdir(MODEL_DIR, { recursive: true });
  await download(MODEL_URL, MODEL_PATH);

  await mkdir(dirname(MARKER), { recursive: true });
  await writeFile(MARKER, expected, 'utf8');
  log('done.');
}

main().catch((err) => {
  console.error('[fetch-whisper-model] failed:', err);
  process.exit(1);
});
