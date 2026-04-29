import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ChatMessage, ChatHistory } from '@shared/types/chat';
import { useIpcSubscriptions } from '@/composables/useIpcSubscriptions';

interface PendingState {
  messageId: string;
  partial: string;
}

interface ChatEntry {
  messages: ChatMessage[];
  pending: PendingState | null;
  lastError: string | null;
  loaded: boolean;
}

function emptyEntry(): ChatEntry {
  return { messages: [], pending: null, lastError: null, loaded: false };
}

export const useChatStore = defineStore('chat', () => {
  const entries = ref<Record<string, ChatEntry>>({});
  // messageId → transcriptId mapping (so chunks route correctly)
  const messageOwners = ref<Record<string, string>>({});

  function get(id: string): ChatEntry {
    return entries.value[id] ?? emptyEntry();
  }

  function setEntry(id: string, patch: Partial<ChatEntry>) {
    const current = entries.value[id] ?? emptyEntry();
    entries.value = { ...entries.value, [id]: { ...current, ...patch } };
  }

  function clearOwner(messageId: string) {
    const owners = { ...messageOwners.value };
    delete owners[messageId];
    messageOwners.value = owners;
  }

  function loadInitial(id: string, history: ChatHistory | undefined) {
    setEntry(id, {
      messages: history?.messages ? [...history.messages] : [],
      pending: null,
      lastError: null,
      loaded: true
    });
  }

  async function load(id: string) {
    try {
      const res = await window.api.transcriptsLoad({ id });
      loadInitial(id, res.chat);
    } catch (e) {
      setEntry(id, { lastError: e instanceof Error ? e.message : String(e), loaded: true });
    }
  }

  async function send(id: string, text: string, model?: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const entry = entries.value[id] ?? emptyEntry();
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString()
    };
    setEntry(id, {
      messages: [...entry.messages, userMsg],
      lastError: null
    });
    try {
      const res = await window.api.chatSend({ id, userMessage: trimmed, model });
      messageOwners.value = { ...messageOwners.value, [res.messageId]: id };
      setEntry(id, { pending: { messageId: res.messageId, partial: '' } });
    } catch (e) {
      setEntry(id, {
        lastError: e instanceof Error ? e.message : String(e)
      });
    }
  }

  async function cancel(id: string) {
    const entry = entries.value[id];
    if (!entry?.pending) return;
    const messageId = entry.pending.messageId;
    // Only invoke chatCancel — the main process emits chat:error in response,
    // which the onChatError handler appends a single errored message for.
    // Adding one here too produced duplicate cancellation messages.
    try {
      await window.api.chatCancel({ messageId });
    } catch (e) {
      setEntry(id, { lastError: e instanceof Error ? e.message : String(e) });
    }
  }

  async function clear(id: string) {
    try {
      await window.api.chatClear({ id });
      setEntry(id, { messages: [], pending: null, lastError: null });
    } catch (e) {
      setEntry(id, { lastError: e instanceof Error ? e.message : String(e) });
    }
  }

  const dispose = useIpcSubscriptions((api) => [
    api.onChatChunk((p) => {
      const transcriptId = messageOwners.value[p.messageId];
      if (!transcriptId) return;
      const entry = entries.value[transcriptId] ?? emptyEntry();
      const partial = (entry.pending?.partial ?? '') + p.delta;
      if (p.done) {
        const finalized: ChatMessage = {
          id: p.messageId,
          role: 'assistant',
          content: partial,
          createdAt: new Date().toISOString()
        };
        setEntry(transcriptId, {
          messages: [...entry.messages, finalized],
          pending: null
        });
        clearOwner(p.messageId);
      } else {
        setEntry(transcriptId, { pending: { messageId: p.messageId, partial } });
      }
    }),
    api.onChatError((p) => {
      const transcriptId = messageOwners.value[p.messageId];
      if (!transcriptId) return;
      const entry = entries.value[transcriptId] ?? emptyEntry();
      const partial = entry.pending?.partial ?? '';
      const errored: ChatMessage = {
        id: p.messageId,
        role: 'assistant',
        content: partial,
        createdAt: new Date().toISOString(),
        errored: true
      };
      setEntry(transcriptId, {
        messages: [...entry.messages, errored],
        pending: null,
        lastError: p.error
      });
      clearOwner(p.messageId);
    })
  ]);

  if (import.meta.hot) import.meta.hot.dispose(dispose);

  return {
    entries,
    get,
    load,
    loadInitial,
    send,
    cancel,
    clear,
    dispose
  };
});
