import type { Transcript, TranscriptSummary, WhisperModelSize } from './transcript';
import type { Analysis } from './analysis';
import type { ChatHistory } from './chat';
import type { AppSettings } from './settings';

export type TranscribeStage = 'load' | 'transcribe' | 'diarize' | 'finalize';

export interface TranscribeStartReq {
  filePath: string;
  modelSize?: WhisperModelSize;
}
export interface TranscribeStartRes {
  transcriptId: string;
}
export interface TranscribeCancelReq {
  transcriptId: string;
}

export interface TranscriptsLoadReq {
  id: string;
}
export interface TranscriptsLoadRes {
  transcript: Transcript;
  analysis?: Analysis;
  chat?: ChatHistory;
}
export interface TranscriptsRenameReq {
  id: string;
  title: string;
}
export interface TranscriptsDeleteReq {
  id: string;
}
export interface TranscriptsRenameSpeakerReq {
  id: string;
  from: string;
  to: string;
}

export interface AnalyzeRunReq {
  id: string;
  model?: string;
}

export interface ChatSendReq {
  id: string;
  userMessage: string;
  model?: string;
}
export interface ChatSendRes {
  messageId: string;
}
export interface ChatCancelReq {
  messageId: string;
}
export interface ChatClearReq {
  id: string;
}

export interface OllamaHealth {
  running: boolean;
  version?: string;
  models: string[];
}
export interface OllamaPullReq {
  model: string;
}

export interface SidecarHealth {
  ready: boolean;
  pythonVersion?: string;
  whisperxVersion?: string;
  error?: string;
}

export interface PyannoteEnsureRes {
  ready: boolean;
  cachedAt?: string;
}

export type ResourceKind = 'pyannote' | 'whisper' | 'python';

export interface ResourceInfo {
  kind: ResourceKind;
  label: string;
  path: string;
  exists: boolean;
  sizeBytes: number;
  removable: boolean;
  reasonNotRemovable?: string;
}

export interface ResourcesDeleteReq {
  kind: ResourceKind;
}

export interface FsRevealReq {
  id: string;
}
export interface OkRes {
  ok: true;
}

// Push payloads
export interface TranscribeProgressPayload {
  transcriptId: string;
  stage: TranscribeStage;
  percent: number;
  message?: string;
}
export interface TranscribeDonePayload {
  transcriptId: string;
  transcript: Transcript;
}
export interface TranscribeErrorPayload {
  transcriptId: string;
  error: string;
  stage: TranscribeStage;
}
export interface ChatChunkPayload {
  messageId: string;
  delta: string;
  done: boolean;
}
export interface ChatErrorPayload {
  messageId: string;
  error: string;
}
export interface OllamaPullProgressPayload {
  model: string;
  percent: number;
  status: string;
}
export interface PyannoteDownloadProgressPayload {
  percent: number;
  status: string;
}

// The full window.api surface that preload exposes to the renderer.
export interface RendererApi {
  transcribeStart: (req: TranscribeStartReq) => Promise<TranscribeStartRes>;
  transcribeCancel: (req: TranscribeCancelReq) => Promise<OkRes>;

  transcriptsList: () => Promise<TranscriptSummary[]>;
  transcriptsLoad: (req: TranscriptsLoadReq) => Promise<TranscriptsLoadRes>;
  transcriptsRename: (req: TranscriptsRenameReq) => Promise<TranscriptSummary>;
  transcriptsDelete: (req: TranscriptsDeleteReq) => Promise<OkRes>;
  transcriptsRenameSpeaker: (req: TranscriptsRenameSpeakerReq) => Promise<Transcript>;

  analyzeRun: (req: AnalyzeRunReq) => Promise<Analysis>;

  chatSend: (req: ChatSendReq) => Promise<ChatSendRes>;
  chatCancel: (req: ChatCancelReq) => Promise<OkRes>;
  chatClear: (req: ChatClearReq) => Promise<OkRes>;

  ollamaHealth: () => Promise<OllamaHealth>;
  ollamaPullModel: (req: OllamaPullReq) => Promise<OkRes>;

  sidecarHealth: () => Promise<SidecarHealth>;
  pyannoteEnsure: () => Promise<PyannoteEnsureRes>;

  resourcesList: () => Promise<ResourceInfo[]>;
  resourcesDelete: (req: ResourcesDeleteReq) => Promise<ResourceInfo>;

  settingsGet: () => Promise<AppSettings>;
  settingsSet: (patch: Partial<AppSettings>) => Promise<AppSettings>;

  fsReveal: (req: FsRevealReq) => Promise<OkRes>;

  /**
   * Returns the absolute filesystem path of a `File` from a drop or file-picker.
   * Wraps Electron's `webUtils.getPathForFile` (which replaced the deprecated
   * `File.path` property in Electron 32+). Synchronous — runs in the preload.
   */
  getPathForFile: (file: File) => string;

  // Push subscriptions — return an unsubscribe function.
  onTranscribeProgress: (cb: (p: TranscribeProgressPayload) => void) => () => void;
  onTranscribeDone: (cb: (p: TranscribeDonePayload) => void) => () => void;
  onTranscribeError: (cb: (p: TranscribeErrorPayload) => void) => () => void;
  onChatChunk: (cb: (p: ChatChunkPayload) => void) => () => void;
  onChatError: (cb: (p: ChatErrorPayload) => void) => () => void;
  onOllamaPullProgress: (cb: (p: OllamaPullProgressPayload) => void) => () => void;
  onPyannoteDownloadProgress: (cb: (p: PyannoteDownloadProgressPayload) => void) => () => void;
}
