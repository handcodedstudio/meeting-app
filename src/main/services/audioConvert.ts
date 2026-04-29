import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface DecodedAudio {
  samples: Float32Array;
  sampleRate: 16000;
  durationSec: number;
}

const TARGET_SAMPLE_RATE = 16000;

/**
 * Decode any ffmpeg-supported audio file to mono 16-kHz float32 PCM in memory.
 * Both whisper.cpp and sherpa-onnx want exactly this shape.
 *
 * The temporary WAV file is removed before returning, so callers don't have
 * to clean up paths — only the in-memory `samples` buffer.
 */
export async function decodeToFloat32Pcm(filePath: string): Promise<DecodedAudio> {
  const dir = await mkdtemp(join(tmpdir(), 'transcribe-'));
  const wavPath = join(dir, 'audio.f32.wav');
  try {
    await runFfmpeg(filePath, wavPath);
    const buf = await readFile(wavPath);
    const { samples, sampleRate } = parseFloat32Wav(buf);
    if (sampleRate !== TARGET_SAMPLE_RATE) {
      throw new Error(`unexpected sample rate ${sampleRate}, wanted ${TARGET_SAMPLE_RATE}`);
    }
    return {
      samples,
      sampleRate: TARGET_SAMPLE_RATE,
      durationSec: samples.length / TARGET_SAMPLE_RATE
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runFfmpeg(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-loglevel', 'error',
      '-i', input,
      '-ac', '1',
      '-ar', String(TARGET_SAMPLE_RATE),
      '-f', 'wav',
      '-acodec', 'pcm_f32le',
      output
    ];
    let proc;
    try {
      proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      reject(new Error(`ffmpeg spawn failed: ${String(err)}. Is ffmpeg installed and on PATH?`));
      return;
    }
    let stderr = '';
    proc.stderr.on('data', (c) => (stderr += c.toString('utf8')));
    proc.on('error', (err) => reject(err));
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * Parse a WAV file produced by `pcm_f32le, mono, 16 kHz`. We don't try to be
 * a general WAV parser — just enough to find the `fmt ` and `data` chunks
 * for a known float32 mono format.
 */
function parseFloat32Wav(buf: Buffer): { samples: Float32Array; sampleRate: number } {
  if (buf.length < 44) throw new Error('wav: file too small');
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('wav: not a RIFF/WAVE file');
  }

  let offset = 12;
  let sampleRate = 0;
  let numChannels = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataStart = -1;
  let dataLen = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    if (id === 'fmt ') {
      audioFormat = buf.readUInt16LE(bodyStart);
      numChannels = buf.readUInt16LE(bodyStart + 2);
      sampleRate = buf.readUInt32LE(bodyStart + 4);
      bitsPerSample = buf.readUInt16LE(bodyStart + 14);
    } else if (id === 'data') {
      dataStart = bodyStart;
      dataLen = size;
      break;
    }
    offset = bodyStart + size + (size % 2); // RIFF chunk padding
  }

  if (dataStart < 0) throw new Error('wav: no data chunk');
  // PCM_F32LE = format 3 (IEEE float). Some encoders write 0xFFFE (extensible).
  if (audioFormat !== 3 && audioFormat !== 0xfffe) {
    throw new Error(`wav: expected float32 PCM, got format ${audioFormat}`);
  }
  if (bitsPerSample !== 32) throw new Error(`wav: expected 32-bit, got ${bitsPerSample}`);
  if (numChannels !== 1) throw new Error(`wav: expected mono, got ${numChannels} channels`);

  const sampleCount = dataLen / 4;
  // Buffer's underlying ArrayBuffer may be shared with other Buffer views, so
  // copy the slice into a fresh ArrayBuffer for the Float32Array view.
  const view = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    view[i] = buf.readFloatLE(dataStart + i * 4);
  }
  return { samples: view, sampleRate };
}
