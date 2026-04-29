export const IPC = {
  // invoke (request/response)
  TRANSCRIBE_START: 'transcribe:start',
  TRANSCRIBE_CANCEL: 'transcribe:cancel',
  TRANSCRIPTS_LIST: 'transcripts:list',
  TRANSCRIPTS_LOAD: 'transcripts:load',
  TRANSCRIPTS_RENAME: 'transcripts:rename',
  TRANSCRIPTS_DELETE: 'transcripts:delete',
  TRANSCRIPTS_RENAME_SPEAKER: 'transcripts:renameSpeaker',
  ANALYZE_RUN: 'analyze:run',
  CHAT_SEND: 'chat:send',
  CHAT_CANCEL: 'chat:cancel',
  CHAT_CLEAR: 'chat:clear',
  OLLAMA_HEALTH: 'ollama:health',
  OLLAMA_PULL_MODEL: 'ollama:pullModel',
  RESOURCES_LIST: 'resources:list',
  RESOURCES_DELETE: 'resources:delete',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  FS_REVEAL: 'fs:reveal',

  // push (main → renderer via webContents.send)
  TRANSCRIBE_PROGRESS: 'transcribe:progress',
  TRANSCRIBE_DONE: 'transcribe:done',
  TRANSCRIBE_ERROR: 'transcribe:error',
  CHAT_CHUNK: 'chat:chunk',
  CHAT_ERROR: 'chat:error',
  OLLAMA_PULL_PROGRESS: 'ollama:pullProgress'
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
