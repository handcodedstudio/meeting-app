#!/usr/bin/env node
// Fetch the Systran/faster-whisper-small.en model into resources/models/whisper/small.en/.
// faster-whisper accepts a local directory path as model_size_or_path.
// Idempotent via resources/models/.installed marker.

import { mkdir, readFile, stat, writeFile, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';

const HF_REPO = 'Systran/faster-whisper-small.en';
const HF_REVISION = 'main';
// faster-whisper uses the CTranslate2 layout — preprocessor_config.json from the
// original Transformers-format whisper repos is NOT present and not required.
const FILES = [
  { name: 'config.json', optional: false },
  { name: 'model.bin', optional: false },
  { name: 'tokenizer.json', optional: false },
  { name: 'vocabulary.txt', optional: true }
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const MODEL_DIR = join(REPO_ROOT, 'resources', 'models', 'whisper', 'small.en');
const MARKER = join(REPO_ROOT, 'resources', 'models', '.installed');

function log(...args) {
  console.log('[fetch-whisper-model]', ...args);
}

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

async function downloadFile(url, destPath, optional = false) {
  log('downloading', url);
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'transcription-app-build' }
  });
  if (!res.ok || !res.body) {
    if (optional && (res.status === 404 || res.status === 403)) {
      log(`  optional file missing (${res.status}); skipping ${url}`);
      return false;
    }
    throw new Error(`download failed: HTTP ${res.status} for ${url}`);
  }
  const total = Number(res.headers.get('content-length') ?? 0);
  let received = 0;
  let lastLog = 0;
  // Progress is reported via a Transform stream INSIDE the pipeline so chunks
  // are also forwarded to the sink. Attaching a 'data' listener to a Readable
  // outside the pipeline puts it in flowing mode and races the sink — small
  // files (like config.json) end up empty.
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
    // Don't leave a 0-byte / partial file on disk if the pipeline aborts.
    try {
      await unlink(destPath);
    } catch {
      /* ignore */
    }
    throw err;
  }
  return true;
}

async function main() {
  const expected = `${HF_REPO}@${HF_REVISION}`;
  const current = await readMarker();
  const requiredPresent = (
    await Promise.all(
      FILES.filter((f) => !f.optional).map((f) => pathExists(join(MODEL_DIR, f.name)))
    )
  ).every(Boolean);
  if (current === expected && requiredPresent) {
    log(`already installed (${expected}); skipping.`);
    return;
  }

  log(`fetching ${HF_REPO}@${HF_REVISION} -> ${MODEL_DIR}`);
  await mkdir(MODEL_DIR, { recursive: true });

  for (const file of FILES) {
    const url = `https://huggingface.co/${HF_REPO}/resolve/${HF_REVISION}/${file.name}`;
    const dest = join(MODEL_DIR, file.name);
    await downloadFile(url, dest, file.optional);
  }

  await mkdir(dirname(MARKER), { recursive: true });
  await writeFile(MARKER, expected, 'utf8');
  log('done.');
}

main().catch((err) => {
  console.error('[fetch-whisper-model] failed:', err);
  process.exit(1);
});
