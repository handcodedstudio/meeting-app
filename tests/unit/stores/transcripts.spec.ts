import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { TranscriptSummary } from '../../../src/shared/types/transcript';
import type { RendererApi } from '../../../src/shared/types/ipc';

function summary(overrides: Partial<TranscriptSummary> = {}): TranscriptSummary {
  return {
    id: 'a',
    title: 'A',
    durationSec: 10,
    speakerCount: 1,
    createdAt: '2026-04-28T09:00:00.000Z',
    ...overrides
  };
}

function installApi(api: Partial<RendererApi>) {
  Object.defineProperty(window, 'api', {
    value: api,
    writable: true,
    configurable: true
  });
}

describe('useTranscriptsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refresh() populates summaries from window.api.transcriptsList', async () => {
    const list = [
      summary({ id: 'a', createdAt: '2026-04-28T09:00:00.000Z', title: 'A' }),
      summary({ id: 'b', createdAt: '2026-04-29T09:00:00.000Z', title: 'B' })
    ];
    installApi({
      transcriptsList: vi.fn().mockResolvedValue(list),
      onTranscribeDone: vi.fn(() => () => {})
    });
    const { useTranscriptsStore } = await import('../../../src/renderer/src/stores/transcripts');
    const store = useTranscriptsStore();
    await store.refresh();
    expect(store.summaries.map((s) => s.id)).toEqual(['a', 'b']);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('refresh() sets error on rejection without throwing', async () => {
    installApi({
      transcriptsList: vi.fn().mockRejectedValue(new Error('boom')),
      onTranscribeDone: vi.fn(() => () => {})
    });
    const { useTranscriptsStore } = await import('../../../src/renderer/src/stores/transcripts');
    const store = useTranscriptsStore();
    await store.refresh();
    expect(store.error).toBe('boom');
    expect(store.summaries).toEqual([]);
  });

  it('rename() optimistically updates the entry then commits the API result', async () => {
    const initial = [summary({ id: 'a', title: 'Old' }), summary({ id: 'b', title: 'B' })];
    let pending: ((value: TranscriptSummary) => void) | null = null;
    const renameSpy = vi.fn(
      () =>
        new Promise<TranscriptSummary>((resolve) => {
          pending = resolve;
        })
    );
    installApi({
      transcriptsList: vi.fn().mockResolvedValue(initial),
      transcriptsRename: renameSpy,
      onTranscribeDone: vi.fn(() => () => {})
    });
    const { useTranscriptsStore } = await import('../../../src/renderer/src/stores/transcripts');
    const store = useTranscriptsStore();
    await store.refresh();

    const promise = store.rename('a', 'New');
    expect(store.summaries.find((s) => s.id === 'a')?.title).toBe('New');
    pending!(summary({ id: 'a', title: 'New (server)' }));
    await promise;
    expect(store.summaries.find((s) => s.id === 'a')?.title).toBe('New (server)');
  });

  it('rename() rolls back on API rejection', async () => {
    const initial = [summary({ id: 'a', title: 'Original' })];
    installApi({
      transcriptsList: vi.fn().mockResolvedValue(initial),
      transcriptsRename: vi.fn().mockRejectedValue(new Error('nope')),
      onTranscribeDone: vi.fn(() => () => {})
    });
    const { useTranscriptsStore } = await import('../../../src/renderer/src/stores/transcripts');
    const store = useTranscriptsStore();
    await store.refresh();
    await expect(store.rename('a', 'Attempt')).rejects.toThrowError('nope');
    expect(store.summaries.find((s) => s.id === 'a')?.title).toBe('Original');
  });

  it('remove() optimistically removes then commits when API resolves', async () => {
    const initial = [summary({ id: 'a' }), summary({ id: 'b' })];
    installApi({
      transcriptsList: vi.fn().mockResolvedValue(initial),
      transcriptsDelete: vi.fn().mockResolvedValue({ ok: true }),
      onTranscribeDone: vi.fn(() => () => {})
    });
    const { useTranscriptsStore } = await import('../../../src/renderer/src/stores/transcripts');
    const store = useTranscriptsStore();
    await store.refresh();
    await store.remove('a');
    expect(store.summaries.map((s) => s.id)).toEqual(['b']);
  });

  it('remove() restores the deleted entry on API rejection', async () => {
    const initial = [summary({ id: 'a' })];
    installApi({
      transcriptsList: vi.fn().mockResolvedValue(initial),
      transcriptsDelete: vi.fn().mockRejectedValue(new Error('fail')),
      onTranscribeDone: vi.fn(() => () => {})
    });
    const { useTranscriptsStore } = await import('../../../src/renderer/src/stores/transcripts');
    const store = useTranscriptsStore();
    await store.refresh();
    await expect(store.remove('a')).rejects.toThrowError('fail');
    expect(store.summaries.map((s) => s.id)).toContain('a');
  });

  it('remove() clears currentId when the removed id was active', async () => {
    const initial = [summary({ id: 'a' })];
    installApi({
      transcriptsList: vi.fn().mockResolvedValue(initial),
      transcriptsDelete: vi.fn().mockResolvedValue({ ok: true }),
      onTranscribeDone: vi.fn(() => () => {})
    });
    const { useTranscriptsStore } = await import('../../../src/renderer/src/stores/transcripts');
    const store = useTranscriptsStore();
    await store.refresh();
    store.currentId = 'a';
    await store.remove('a');
    expect(store.currentId).toBeNull();
  });
});
