import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type {
  TranscriptsLoadReq,
  TranscriptsLoadRes,
  TranscriptsRenameReq,
  TranscriptsDeleteReq,
  TranscriptsRenameSpeakerReq,
  OkRes
} from '@shared/types/ipc';
import type { Transcript, TranscriptSummary } from '@shared/types/transcript';
import {
  listTranscripts,
  loadTranscript,
  loadAnalysis,
  loadChat,
  saveTranscript,
  deleteTranscript
} from '../services/storage.js';
import { assertUlid } from '../utils/ulid.js';
import { logger } from '../services/logger.js';

async function handleList(): Promise<TranscriptSummary[]> {
  try {
    return await listTranscripts();
  } catch (err) {
    logger.error('transcripts:list failed', err);
    throw err;
  }
}

async function handleLoad(_e: unknown, req: TranscriptsLoadReq): Promise<TranscriptsLoadRes> {
  try {
    const id = assertUlid(req?.id, 'transcript id');
    const transcript = await loadTranscript(id);
    if (!transcript) throw new Error(`Transcript not found: ${id}`);
    const [analysis, chat] = await Promise.all([loadAnalysis(id), loadChat(id)]);
    const res: TranscriptsLoadRes = { transcript };
    if (analysis) res.analysis = analysis;
    if (chat) res.chat = chat;
    return res;
  } catch (err) {
    logger.error('transcripts:load failed', err);
    throw err;
  }
}

async function handleRename(
  _e: unknown,
  req: TranscriptsRenameReq
): Promise<TranscriptSummary> {
  try {
    const id = assertUlid(req?.id, 'transcript id');
    const existing = await loadTranscript(id);
    if (!existing) throw new Error(`Transcript not found: ${id}`);
    const updated = await saveTranscript({ ...existing, title: req.title });
    return {
      id: updated.id,
      title: updated.title,
      durationSec: updated.audio.durationSec,
      speakerCount: updated.stats.speakerCount,
      createdAt: updated.createdAt
    };
  } catch (err) {
    logger.error('transcripts:rename failed', err);
    throw err;
  }
}

async function handleDelete(_e: unknown, req: TranscriptsDeleteReq): Promise<OkRes> {
  try {
    const id = assertUlid(req?.id, 'transcript id');
    await deleteTranscript(id);
    return { ok: true };
  } catch (err) {
    logger.error('transcripts:delete failed', err);
    throw err;
  }
}

async function handleRenameSpeaker(
  _e: unknown,
  req: TranscriptsRenameSpeakerReq
): Promise<Transcript> {
  try {
    const id = assertUlid(req?.id, 'transcript id');
    const existing = await loadTranscript(id);
    if (!existing) throw new Error(`Transcript not found: ${id}`);
    const speakers = existing.speakers.map((s) =>
      s.id === req.from ? { ...s, displayName: req.to } : s
    );
    const turns = existing.turns.map((t) =>
      t.speaker === req.from ? { ...t, displayName: req.to } : t
    );
    return await saveTranscript({ ...existing, speakers, turns });
  } catch (err) {
    logger.error('transcripts:renameSpeaker failed', err);
    throw err;
  }
}

export function registerTranscriptsHandlers(): void {
  ipcMain.handle(IPC.TRANSCRIPTS_LIST, handleList);
  ipcMain.handle(IPC.TRANSCRIPTS_LOAD, handleLoad);
  ipcMain.handle(IPC.TRANSCRIPTS_RENAME, handleRename);
  ipcMain.handle(IPC.TRANSCRIPTS_DELETE, handleDelete);
  ipcMain.handle(IPC.TRANSCRIPTS_RENAME_SPEAKER, handleRenameSpeaker);
}
