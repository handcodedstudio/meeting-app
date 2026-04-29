import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type {
  PyannoteEnsureRes,
  SidecarHealth,
  TranscribeCancelReq,
  TranscribeStartReq,
  TranscribeStartRes,
  PyannoteDownloadProgressPayload,
  OkRes
} from '@shared/types/ipc';
import { getSidecar } from '../services/sidecar.js';
import { ensurePyannoteWeights } from '../services/modelDownloader.js';
import { startTranscribe } from '../services/transcribePipeline.js';
import { getSettings } from '../services/settings.js';
import { logger } from '../services/logger.js';

export function registerTranscribeHandlers(): void {
  ipcMain.handle(
    IPC.TRANSCRIBE_START,
    async (event: IpcMainInvokeEvent, req: TranscribeStartReq): Promise<TranscribeStartRes> => {
      if (!req?.filePath) throw new Error('filePath is required');
      const result = startTranscribe(
        req.filePath,
        { modelSize: req.modelSize },
        event.sender
      );
      return result;
    }
  );

  ipcMain.handle(
    IPC.TRANSCRIBE_CANCEL,
    async (_event, req: TranscribeCancelReq): Promise<OkRes> => {
      if (!req?.transcriptId) throw new Error('transcriptId is required');
      await getSidecar().cancel(req.transcriptId);
      return { ok: true };
    }
  );

  ipcMain.handle(IPC.SIDECAR_HEALTH, async (): Promise<SidecarHealth> => {
    const result = await getSidecar().health();
    return {
      ready: result.ready,
      ...(result.pythonVersion ? { pythonVersion: result.pythonVersion } : {}),
      ...(result.whisperxVersion ? { whisperxVersion: result.whisperxVersion } : {}),
      ...(result.error ? { error: result.error } : {})
    };
  });

  ipcMain.handle(IPC.PYANNOTE_ENSURE, async (event: IpcMainInvokeEvent): Promise<PyannoteEnsureRes> => {
    const settings = await getSettings();
    try {
      const result = await ensurePyannoteWeights({
        token: settings.huggingfaceToken,
        onProgress: (p) => {
          if (event.sender.isDestroyed()) return;
          const payload: PyannoteDownloadProgressPayload = {
            percent: p.percent,
            status: p.status
          };
          event.sender.send(IPC.PYANNOTE_DOWNLOAD_PROGRESS, payload);
        }
      });
      return { ready: result.ready, cachedAt: result.cachedAt };
    } catch (err) {
      logger.error('pyannote:ensure failed', String(err));
      throw err;
    }
  });
}
