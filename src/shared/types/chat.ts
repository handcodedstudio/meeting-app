export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  model?: string;
  errored?: boolean;
}

export interface ChatHistory {
  schemaVersion: 1;
  transcriptId: string;
  messages: ChatMessage[];
}
