import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import type { Readable, Writable } from 'node:stream';
import { logger } from './logger.js';
import { getPythonExecutable, getSidecarSourceDir } from './paths.js';

interface JsonRpcRequest {
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcError {
  message: string;
  type?: string;
  traceback?: string;
}

interface JsonRpcReply {
  id: number;
  result?: unknown;
  error?: JsonRpcError;
  progress?: { stage: string; percent: number; message?: string };
}

export type SidecarProgressCb = (stage: string, percent: number, message?: string) => void;

export interface SidecarHealthResult {
  ready: boolean;
  pythonVersion?: string;
  whisperxVersion?: string;
  error?: string;
}

interface PendingCall {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  onProgress?: SidecarProgressCb;
}

// 4-byte big-endian length-prefix framing — matches resources/python/app/rpc.py.
class FrameDecoder {
  private buf: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): JsonRpcReply[] {
    this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
    const out: JsonRpcReply[] = [];
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32BE(0);
      if (this.buf.length < 4 + len) break;
      const body = this.buf.subarray(4, 4 + len);
      this.buf = this.buf.subarray(4 + len);
      try {
        out.push(JSON.parse(body.toString('utf8')) as JsonRpcReply);
      } catch (err) {
        logger.error('sidecar: failed to parse JSON frame', String(err));
      }
    }
    return out;
  }
}

function encodeFrame(req: JsonRpcRequest): Buffer {
  const body = Buffer.from(JSON.stringify(req), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

class SidecarManager {
  private child: ChildProcessByStdio<Writable, Readable, Readable> | null = null;
  private decoder = new FrameDecoder();
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private startPromise: Promise<void> | null = null;
  private exitListeners: Array<(code: number | null) => void> = [];

  async start(): Promise<void> {
    if (this.child) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.spawnChild();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async spawnChild(): Promise<void> {
    const python = getPythonExecutable();
    const script = join(getSidecarSourceDir(), 'sidecar.py');

    try {
      await stat(python);
    } catch {
      throw new Error(
        `Python sidecar interpreter not found at ${python}. Run "npm run fetch:resources" before launching the app.`
      );
    }

    logger.info('sidecar: spawning', python, script);
    const proc = spawn(python, [script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }
    }) as ChildProcessByStdio<Writable, Readable, Readable>;

    proc.stdout.on('data', (chunk: Buffer) => {
      for (const reply of this.decoder.push(chunk)) {
        this.handleReply(reply);
      }
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim();
      if (text) logger.warn('sidecar.stderr', text);
    });
    proc.on('error', (err) => {
      logger.error('sidecar: spawn error', String(err));
      this.failAllPending(err);
      this.child = null;
    });
    proc.on('exit', (code) => {
      logger.info('sidecar: exited', { code });
      const err = new Error(`sidecar exited with code ${code}`);
      this.failAllPending(err);
      this.child = null;
      for (const cb of this.exitListeners) cb(code);
    });

    this.child = proc;
  }

  private handleReply(reply: JsonRpcReply): void {
    const pending = this.pending.get(reply.id);
    if (!pending) return;
    if (reply.progress) {
      try {
        pending.onProgress?.(reply.progress.stage, reply.progress.percent, reply.progress.message);
      } catch (err) {
        logger.warn('sidecar: progress callback threw', String(err));
      }
      return;
    }
    this.pending.delete(reply.id);
    if (reply.error) {
      pending.reject(new Error(reply.error.message || 'sidecar error'));
      return;
    }
    pending.resolve(reply.result);
  }

  private failAllPending(err: Error): void {
    for (const [, pending] of this.pending) pending.reject(err);
    this.pending.clear();
  }

  async call<T>(
    method: string,
    params: Record<string, unknown> = {},
    opts: { onProgress?: SidecarProgressCb } = {}
  ): Promise<T> {
    await this.start();
    if (!this.child || !this.child.stdin.writable) {
      throw new Error('sidecar is not running');
    }
    const id = this.nextId++;
    const req: JsonRpcRequest = { id, method, params };
    const frame = encodeFrame(req);

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        onProgress: opts.onProgress
      });
      this.child!.stdin.write(frame, (writeErr) => {
        if (writeErr) {
          this.pending.delete(id);
          reject(writeErr);
        }
      });
    });
  }

  async health(): Promise<SidecarHealthResult> {
    try {
      const result = await this.call<{
        ready: boolean;
        pythonVersion?: string;
        whisperxVersion?: string;
      }>('health');
      return {
        ready: !!result.ready,
        ...(result.pythonVersion ? { pythonVersion: result.pythonVersion } : {}),
        ...(result.whisperxVersion ? { whisperxVersion: result.whisperxVersion } : {})
      };
    } catch (err) {
      return { ready: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async cancel(jobId: string): Promise<void> {
    if (!this.child) return;
    try {
      await this.call('cancel', { jobId });
    } catch (err) {
      logger.warn('sidecar: cancel failed', String(err));
    }
  }

  dispose(): void {
    if (!this.child) return;
    try {
      this.child.stdin.end();
    } catch {
      /* ignore */
    }
    try {
      this.child.kill();
    } catch {
      /* ignore */
    }
    this.child = null;
    this.failAllPending(new Error('sidecar disposed'));
  }
}

let instance: SidecarManager | null = null;

export function getSidecar(): SidecarManager {
  if (!instance) instance = new SidecarManager();
  return instance;
}

export type { SidecarManager };
