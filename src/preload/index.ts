import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type { RendererApi } from '@shared/types/ipc';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: RendererApi = {
  transcribeStart: (req) => ipcRenderer.invoke(IPC.TRANSCRIBE_START, req),
  transcribeCancel: (req) => ipcRenderer.invoke(IPC.TRANSCRIBE_CANCEL, req),

  transcriptsList: () => ipcRenderer.invoke(IPC.TRANSCRIPTS_LIST),
  transcriptsLoad: (req) => ipcRenderer.invoke(IPC.TRANSCRIPTS_LOAD, req),
  transcriptsRename: (req) => ipcRenderer.invoke(IPC.TRANSCRIPTS_RENAME, req),
  transcriptsDelete: (req) => ipcRenderer.invoke(IPC.TRANSCRIPTS_DELETE, req),
  transcriptsRenameSpeaker: (req) => ipcRenderer.invoke(IPC.TRANSCRIPTS_RENAME_SPEAKER, req),

  analyzeRun: (req) => ipcRenderer.invoke(IPC.ANALYZE_RUN, req),

  chatSend: (req) => ipcRenderer.invoke(IPC.CHAT_SEND, req),
  chatCancel: (req) => ipcRenderer.invoke(IPC.CHAT_CANCEL, req),
  chatClear: (req) => ipcRenderer.invoke(IPC.CHAT_CLEAR, req),

  ollamaHealth: () => ipcRenderer.invoke(IPC.OLLAMA_HEALTH),
  ollamaPullModel: (req) => ipcRenderer.invoke(IPC.OLLAMA_PULL_MODEL, req),

  sidecarHealth: () => ipcRenderer.invoke(IPC.SIDECAR_HEALTH),
  pyannoteEnsure: () => ipcRenderer.invoke(IPC.PYANNOTE_ENSURE),

  resourcesList: () => ipcRenderer.invoke(IPC.RESOURCES_LIST),
  resourcesDelete: (req) => ipcRenderer.invoke(IPC.RESOURCES_DELETE, req),

  settingsGet: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  settingsSet: (patch) => ipcRenderer.invoke(IPC.SETTINGS_SET, patch),

  fsReveal: (req) => ipcRenderer.invoke(IPC.FS_REVEAL, req),

  getPathForFile: (file) => webUtils.getPathForFile(file),

  onTranscribeProgress: (cb) => subscribe(IPC.TRANSCRIBE_PROGRESS, cb),
  onTranscribeDone: (cb) => subscribe(IPC.TRANSCRIBE_DONE, cb),
  onTranscribeError: (cb) => subscribe(IPC.TRANSCRIBE_ERROR, cb),
  onChatChunk: (cb) => subscribe(IPC.CHAT_CHUNK, cb),
  onChatError: (cb) => subscribe(IPC.CHAT_ERROR, cb),
  onOllamaPullProgress: (cb) => subscribe(IPC.OLLAMA_PULL_PROGRESS, cb),
  onPyannoteDownloadProgress: (cb) => subscribe(IPC.PYANNOTE_DOWNLOAD_PROGRESS, cb)
};

contextBridge.exposeInMainWorld('api', api);
