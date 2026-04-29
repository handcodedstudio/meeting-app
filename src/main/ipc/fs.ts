import { ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { IPC } from '@shared/ipc-channels';
import type { FsRevealReq, OkRes } from '@shared/types/ipc';
import { getTranscriptDir } from '../services/paths.js';
import { assertUlid } from '../utils/ulid.js';
import { logger } from '../services/logger.js';

async function handleReveal(_e: unknown, req: FsRevealReq): Promise<OkRes> {
  try {
    const id = assertUlid(req?.id, 'transcript id');
    // Point Finder at transcript.json so the containing dir opens with the file selected.
    const target = join(getTranscriptDir(id), 'transcript.json');
    shell.showItemInFolder(target);
    return { ok: true };
  } catch (err) {
    logger.error('fs:reveal failed', err);
    throw err;
  }
}

export function registerFsHandlers(): void {
  ipcMain.handle(IPC.FS_REVEAL, handleReveal);
}
