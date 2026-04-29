import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type {
  TranscribeCancelReq,
  TranscribeStartReq,
  TranscribeStartRes,
  OkRes
} from '@shared/types/ipc';
import { cancelTranscribe, startTranscribe } from '../services/transcribePipeline.js';
import { logger } from '../services/logger.js';

export function registerTranscribeHandlers(): void {
  ipcMain.handle(
    IPC.TRANSCRIBE_START,
    async (event: IpcMainInvokeEvent, req: TranscribeStartReq): Promise<TranscribeStartRes> => {
      if (!req?.filePath) throw new Error('filePath is required');
      return startTranscribe(req.filePath, { modelSize: req.modelSize }, event.sender);
    }
  );

  ipcMain.handle(
    IPC.TRANSCRIBE_CANCEL,
    async (_event, req: TranscribeCancelReq): Promise<OkRes> => {
      if (!req?.transcriptId) throw new Error('transcriptId is required');
      cancelTranscribe(req.transcriptId);
      logger.info('transcribe: cancel requested', req.transcriptId);
      return { ok: true };
    }
  );
}
