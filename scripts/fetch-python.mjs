#!/usr/bin/env node
// Fetch a portable CPython 3.12 (python-build-standalone) for darwin-arm64,
// unpack into resources/python/, then pip-install the sidecar requirements.
//
// Idempotent via the resources/python/.installed marker, which records the
// pinned PBS tag. If the marker matches, this script is a no-op.

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { extract as tarExtract } from 'tar';

// Pinned python-build-standalone release. Update both fields together.
// The fallback URL is used if the GitHub releases API can't be reached.
const PBS_TAG = '20241016';
const PBS_PYTHON_VERSION = '3.12.7';
const PBS_FILENAME = `cpython-${PBS_PYTHON_VERSION}+${PBS_TAG}-aarch64-apple-darwin-install_only.tar.gz`;
const PBS_FALLBACK_URL = `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${PBS_FILENAME}`;
const PBS_RELEASE_API = `https://api.github.com/repos/astral-sh/python-build-standalone/releases/tags/${PBS_TAG}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const PYTHON_DIR = join(REPO_ROOT, 'resources', 'python');
const MARKER = join(PYTHON_DIR, '.installed');
const REQUIREMENTS = join(PYTHON_DIR, 'app', 'requirements.txt');
const PYTHON_BIN = join(PYTHON_DIR, 'bin', 'python3');

function log(...args) {
  console.log('[fetch-python]', ...args);
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

async function resolveDownloadUrl() {
  try {
    const res = await fetch(PBS_RELEASE_API, {
      headers: { 'User-Agent': 'transcription-app-build', Accept: 'application/vnd.github+json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const asset = (json.assets ?? []).find((a) => a.name === PBS_FILENAME);
    if (asset?.browser_download_url) return asset.browser_download_url;
    log('release JSON did not contain expected asset; using fallback URL');
  } catch (err) {
    log('failed to query GitHub releases API:', String(err));
  }
  return PBS_FALLBACK_URL;
}

async function downloadToFile(url, destPath) {
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
  const reader = Readable.fromWeb(res.body);
  reader.on('data', (chunk) => {
    received += chunk.length;
    if (total && Date.now() - lastLog > 1000) {
      const pct = ((received / total) * 100).toFixed(1);
      log(`  ${pct}% (${received}/${total})`);
      lastLog = Date.now();
    }
  });
  await mkdir(dirname(destPath), { recursive: true });
  await pipeline(reader, createWriteStream(destPath));
  log('downloaded to', destPath);
}

async function extractTarball(tarballPath, destDir) {
  log('extracting', tarballPath, '->', destDir);
  // The install_only tarball extracts into a top-level "python/" directory.
  // We strip that prefix so files land directly under resources/python/.
  await tarExtract({
    file: tarballPath,
    cwd: destDir,
    strip: 1
  });
}

function runCommand(cmd, args, cwd) {
  return new Promise((resolveProc, reject) => {
    log('$', cmd, args.join(' '));
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolveProc();
      else reject(new Error(`${cmd} exited with ${code}`));
    });
  });
}

async function main() {
  const expected = `${PBS_TAG}:${PBS_PYTHON_VERSION}`;
  const current = await readMarker();
  if (current === expected && (await pathExists(PYTHON_BIN))) {
    log(`already installed (${expected}); skipping.`);
    return;
  }

  log(`installing python-build-standalone ${PBS_PYTHON_VERSION}+${PBS_TAG}`);
  // Wipe previous interpreter dirs but preserve resources/python/app/.
  for (const sub of ['bin', 'lib', 'include', 'share', 'install']) {
    await rm(join(PYTHON_DIR, sub), { recursive: true, force: true });
  }
  await mkdir(PYTHON_DIR, { recursive: true });

  const url = await resolveDownloadUrl();
  const tarball = join(PYTHON_DIR, PBS_FILENAME);
  await downloadToFile(url, tarball);
  await extractTarball(tarball, PYTHON_DIR);
  await rm(tarball, { force: true });

  if (!(await pathExists(PYTHON_BIN))) {
    throw new Error(`expected python at ${PYTHON_BIN} but it does not exist after extraction`);
  }

  if (await pathExists(REQUIREMENTS)) {
    log('installing pip requirements');
    await runCommand(PYTHON_BIN, ['-m', 'ensurepip', '--upgrade'], REPO_ROOT);
    await runCommand(PYTHON_BIN, ['-m', 'pip', 'install', '--upgrade', 'pip'], REPO_ROOT);
    await runCommand(PYTHON_BIN, ['-m', 'pip', 'install', '-r', REQUIREMENTS], REPO_ROOT);
  } else {
    log(`no requirements.txt at ${REQUIREMENTS}; skipping pip install.`);
  }

  await writeFile(MARKER, expected, 'utf8');
  log('done.');
}

// Keep the createReadStream import alive for downstream tooling that may extend
// this script; suppress unused-warning in environments without lints.
void createReadStream;

main().catch((err) => {
  console.error('[fetch-python] failed:', err);
  process.exit(1);
});
