import { ipcMain, type WebContents } from 'electron';
import { ulid } from 'ulid';
import { IPC } from '@shared/ipc-channels';
import type {
  ChatSendReq,
  ChatSendRes,
  ChatCancelReq,
  ChatClearReq,
  OkRes,
  ChatChunkPayload,
  ChatErrorPayload
} from '@shared/types/ipc';
import type { ChatHistory, ChatMessage } from '@shared/types/chat';
import { loadChat, loadTranscript, saveChat } from '../services/storage.js';
import { getSettings } from '../services/settings.js';
import { buildChatSystemPrompt } from '../prompts/chat.js';
import { streamChat, type OllamaChatMessage } from '../services/ollamaClient.js';
import { assertUlid } from '../utils/ulid.js';
import { logger } from '../services/logger.js';

const inflight = new Map<string, AbortController>();

function emptyHistory(transcriptId: string): ChatHistory {
  return { schemaVersion: 1, transcriptId, messages: [] };
}

async function startStream(
  sender: WebContents,
  args: {
    transcriptId: string;
    messageId: string;
    model: string;
    baseUrl: string;
    systemPrompt: string;
    history: ChatHistory;
    userContent: string;
    controller: AbortController;
  }
): Promise<void> {
  const { transcriptId, messageId, model, baseUrl, systemPrompt, history, userContent, controller } =
    args;
  const ollamaMessages: OllamaChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userContent }
  ];

  let assembled = '';
  let errored = false;
  let errMsg = '';

  try {
    const iter = streamChat(baseUrl, {
      model,
      messages: ollamaMessages,
      options: { temperature: 0.2 },
      signal: controller.signal
    });
    for await (const chunk of iter) {
      if (chunk.content.length > 0) {
        assembled += chunk.content;
        const payload: ChatChunkPayload = {
          messageId,
          delta: chunk.content,
          done: false
        };
        if (!sender.isDestroyed()) sender.send(IPC.CHAT_CHUNK, payload);
      }
      if (chunk.done) {
        const donePayload: ChatChunkPayload = { messageId, delta: '', done: true };
        if (!sender.isDestroyed()) sender.send(IPC.CHAT_CHUNK, donePayload);
        break;
      }
    }
  } catch (err) {
    errored = true;
    errMsg = err instanceof Error ? err.message : String(err);
    logger.error('chat stream failed', errMsg);
    const errorPayload: ChatErrorPayload = { messageId, error: errMsg };
    if (!sender.isDestroyed()) sender.send(IPC.CHAT_ERROR, errorPayload);
  } finally {
    inflight.delete(messageId);
  }

  try {
    const latest = (await loadChat(transcriptId)) ?? emptyHistory(transcriptId);
    const updated = latest.messages.map((m) => {
      if (m.id !== messageId) return m;
      const next: ChatMessage = {
        ...m,
        content: assembled
      };
      if (errored) next.errored = true;
      return next;
    });
    await saveChat({ ...latest, messages: updated });
  } catch (persistErr) {
    logger.error('chat history persist failed', String(persistErr));
  }
}

async function handleSend(e: { sender: WebContents }, req: ChatSendReq): Promise<ChatSendRes> {
  const id = assertUlid(req?.id, 'transcript id');
  const trimmed = req?.userMessage?.trim() ?? '';
  if (!trimmed) throw new Error('userMessage is required');
  const transcript = await loadTranscript(id);
  if (!transcript) throw new Error(`Transcript not found: ${id}`);
  const settings = await getSettings();
  const model = req.model ?? settings.ollamaModel;
  const baseUrl = settings.ollamaUrl;

  const existing = (await loadChat(id)) ?? emptyHistory(id);

  const now = new Date().toISOString();
  const userMessage: ChatMessage = {
    id: ulid(),
    role: 'user',
    content: trimmed,
    createdAt: now
  };
  const assistantMessageId = ulid();
  const assistantPlaceholder: ChatMessage = {
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
    model
  };
  const persisted: ChatHistory = {
    ...existing,
    messages: [...existing.messages, userMessage, assistantPlaceholder]
  };
  await saveChat(persisted);

  const systemPrompt = buildChatSystemPrompt(transcript);
  const controller = new AbortController();
  inflight.set(assistantMessageId, controller);

  // Pre-stream history is everything except the just-added placeholder.
  const historyForStream: ChatHistory = {
    ...existing,
    messages: existing.messages
  };

  void startStream(e.sender, {
    transcriptId: id,
    messageId: assistantMessageId,
    model,
    baseUrl,
    systemPrompt,
    history: historyForStream,
    userContent: trimmed,
    controller
  });

  return { messageId: assistantMessageId };
}

async function handleCancel(_e: unknown, req: ChatCancelReq): Promise<OkRes> {
  const ctrl = inflight.get(req.messageId);
  if (ctrl) {
    try {
      ctrl.abort();
    } catch (err) {
      logger.warn('chat cancel abort error', String(err));
    }
    inflight.delete(req.messageId);
  }
  return { ok: true };
}

async function handleClear(_e: unknown, req: ChatClearReq): Promise<OkRes> {
  const id = assertUlid(req?.id, 'transcript id');
  await saveChat(emptyHistory(id));
  return { ok: true };
}

export function registerChatHandlers(): void {
  ipcMain.handle(IPC.CHAT_SEND, handleSend);
  ipcMain.handle(IPC.CHAT_CANCEL, handleCancel);
  ipcMain.handle(IPC.CHAT_CLEAR, handleClear);
}
