import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type {
  ChatChunkPayload,
  ChatErrorPayload,
  RendererApi
} from '../../../src/shared/types/ipc';
import type { ChatHistory } from '../../../src/shared/types/chat';

interface CapturingApi {
  onChatChunk: ReturnType<typeof vi.fn>;
  onChatError: ReturnType<typeof vi.fn>;
  chatSend: ReturnType<typeof vi.fn>;
  chatCancel: ReturnType<typeof vi.fn>;
  chatClear: ReturnType<typeof vi.fn>;
}

function installApiCapturing(): {
  emitChunk: (p: ChatChunkPayload) => void;
  emitError: (p: ChatErrorPayload) => void;
  api: CapturingApi;
} {
  let chunkCb: (p: ChatChunkPayload) => void = () => {};
  let errorCb: (p: ChatErrorPayload) => void = () => {};
  const api: CapturingApi = {
    onChatChunk: vi.fn((cb: (p: ChatChunkPayload) => void) => {
      chunkCb = cb;
      return () => {};
    }),
    onChatError: vi.fn((cb: (p: ChatErrorPayload) => void) => {
      errorCb = cb;
      return () => {};
    }),
    chatSend: vi.fn(),
    chatCancel: vi.fn().mockResolvedValue({ ok: true }),
    chatClear: vi.fn().mockResolvedValue({ ok: true })
  };
  Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true });
  return {
    emitChunk: (p) => chunkCb(p),
    emitError: (p) => errorCb(p),
    api
  };
}

describe('useChatStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loadInitial() seeds the keyed entry from a ChatHistory', async () => {
    installApiCapturing();
    const { useChatStore } = await import('../../../src/renderer/src/stores/chat');
    const store = useChatStore();
    const history: ChatHistory = {
      schemaVersion: 1,
      transcriptId: 't1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: '2026-04-28T09:00:00.000Z' }]
    };
    store.loadInitial('t1', history);
    expect(store.get('t1').loaded).toBe(true);
    expect(store.get('t1').messages).toHaveLength(1);
    expect(store.get('t1').messages[0]?.content).toBe('hi');
  });

  it('streaming reducer accumulates partials across many chunks then finalises on done', async () => {
    const { emitChunk, api } = installApiCapturing();
    api.chatSend.mockResolvedValue({ messageId: 'msg-1' });

    const { useChatStore } = await import('../../../src/renderer/src/stores/chat');
    const store = useChatStore();
    store.loadInitial('t1', undefined);

    await store.send('t1', 'hello?');
    expect(store.get('t1').pending?.messageId).toBe('msg-1');

    const deltas = ['Hel', 'lo', ' ', 'wor', 'ld'];
    for (const d of deltas) {
      emitChunk({ messageId: 'msg-1', delta: d, done: false });
    }
    expect(store.get('t1').pending?.partial).toBe('Hello world');

    emitChunk({ messageId: 'msg-1', delta: '!', done: true });
    expect(store.get('t1').pending).toBeNull();
    const finalised = store.get('t1').messages.at(-1);
    expect(finalised?.role).toBe('assistant');
    expect(finalised?.content).toBe('Hello world!');
    expect(finalised?.errored).toBeUndefined();
  });

  it('emits errored finalisation when the chat:error channel fires', async () => {
    const { emitChunk, emitError, api } = installApiCapturing();
    api.chatSend.mockResolvedValue({ messageId: 'msg-2' });

    const { useChatStore } = await import('../../../src/renderer/src/stores/chat');
    const store = useChatStore();
    store.loadInitial('t1', undefined);
    await store.send('t1', 'go');
    emitChunk({ messageId: 'msg-2', delta: 'partial...', done: false });
    emitError({ messageId: 'msg-2', error: 'connection lost' });
    const last = store.get('t1').messages.at(-1);
    expect(last?.errored).toBe(true);
    expect(last?.content).toBe('partial...');
    expect(store.get('t1').pending).toBeNull();
    expect(store.get('t1').lastError).toBe('connection lost');
  });

  it('cancel() invokes chatCancel; the chat:error push finalises the message', async () => {
    // The store no longer locally appends a "cancelled" message — that caused
    // a duplicate when the main process emits chat:error in response to the
    // abort. cancel() now just calls the IPC; the error listener is the single
    // path that adds the errored assistant message.
    const { emitChunk, emitError, api } = installApiCapturing();
    api.chatSend.mockResolvedValue({ messageId: 'msg-3' });

    const { useChatStore } = await import('../../../src/renderer/src/stores/chat');
    const store = useChatStore();
    store.loadInitial('t1', undefined);
    await store.send('t1', 'go');
    emitChunk({ messageId: 'msg-3', delta: 'so far...', done: false });
    await store.cancel('t1');
    expect(api.chatCancel).toHaveBeenCalledWith({ messageId: 'msg-3' });
    // No local mutation yet — main process still has to fire chat:error.
    expect(store.get('t1').pending).not.toBeNull();
    emitError({ messageId: 'msg-3', error: 'aborted' });
    const last = store.get('t1').messages.at(-1);
    expect(last?.errored).toBe(true);
    expect(last?.content).toBe('so far...');
    expect(store.get('t1').pending).toBeNull();
  });

  it('cancel() with no pending message is a no-op', async () => {
    const { api } = installApiCapturing();
    const { useChatStore } = await import('../../../src/renderer/src/stores/chat');
    const store = useChatStore();
    store.loadInitial('t1', undefined);
    await store.cancel('t1');
    expect(api.chatCancel).not.toHaveBeenCalled();
  });

  it('clear() invokes chatClear and empties messages', async () => {
    const { api } = installApiCapturing();
    const { useChatStore } = await import('../../../src/renderer/src/stores/chat');
    const store = useChatStore();
    store.loadInitial('t1', {
      schemaVersion: 1,
      transcriptId: 't1',
      messages: [{ id: 'm1', role: 'user', content: 'old', createdAt: 'now' }]
    });
    expect(store.get('t1').messages).toHaveLength(1);
    await store.clear('t1');
    expect(api.chatClear).toHaveBeenCalledWith({ id: 't1' });
    expect(store.get('t1').messages).toEqual([]);
    expect(store.get('t1').lastError).toBeNull();
  });

  it('ignores chunks for unknown messageIds', async () => {
    const { emitChunk } = installApiCapturing();
    const { useChatStore } = await import('../../../src/renderer/src/stores/chat');
    const store = useChatStore();
    store.loadInitial('t1', undefined);
    emitChunk({ messageId: 'unknown', delta: 'x', done: false });
    expect(store.get('t1').pending).toBeNull();
    expect(store.get('t1').messages).toEqual([]);
  });

  it('disposes its IPC subscriptions cleanly', async () => {
    let disposed = 0;
    Object.defineProperty(window, 'api', {
      value: {
        onChatChunk: () => () => {
          disposed += 1;
        },
        onChatError: () => () => {
          disposed += 1;
        }
      } as Partial<RendererApi>,
      writable: true,
      configurable: true
    });
    const { useChatStore } = await import('../../../src/renderer/src/stores/chat');
    const store = useChatStore();
    store.dispose();
    expect(disposed).toBe(2);
  });
});
