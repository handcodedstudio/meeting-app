import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { Analysis } from '../../../src/shared/types/analysis';
import type { RendererApi } from '../../../src/shared/types/ipc';

function installApi(api: Partial<RendererApi>) {
  Object.defineProperty(window, 'api', {
    value: api,
    writable: true,
    configurable: true
  });
}

function buildAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    schemaVersion: 1,
    transcriptId: 't1',
    model: 'llama3.1:8b',
    generatedAt: '2026-04-28T09:05:00.000Z',
    actionItems: [],
    decisions: [],
    keyDates: [],
    openQuestions: [],
    ...overrides
  };
}

describe('useAnalysisStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('setInitial() with data populates the entry as done', async () => {
    installApi({});
    const { useAnalysisStore } = await import('../../../src/renderer/src/stores/analysis');
    const store = useAnalysisStore();
    const a = buildAnalysis({ actionItems: [{ id: 'x', description: 'do' }] });
    store.setInitial('t1', a);
    expect(store.get('t1').status).toBe('done');
    expect(store.get('t1').data?.actionItems).toHaveLength(1);
  });

  it('setInitial() without data leaves status idle on first call', async () => {
    installApi({});
    const { useAnalysisStore } = await import('../../../src/renderer/src/stores/analysis');
    const store = useAnalysisStore();
    store.setInitial('t1', undefined);
    expect(store.get('t1').status).toBe('idle');
  });

  it('run() transitions idle → running → done with data populated', async () => {
    let resolveAnalyze: ((a: Analysis) => void) | null = null;
    const analyzeRun = vi.fn(
      () =>
        new Promise<Analysis>((resolve) => {
          resolveAnalyze = resolve;
        })
    );
    installApi({ analyzeRun });
    const { useAnalysisStore } = await import('../../../src/renderer/src/stores/analysis');
    const store = useAnalysisStore();
    expect(store.get('t1').status).toBe('idle');
    const promise = store.run('t1', 'llama3.1:8b');
    expect(store.get('t1').status).toBe('running');
    resolveAnalyze!(buildAnalysis({ actionItems: [{ id: 'a', description: 'ship' }] }));
    await promise;
    expect(store.get('t1').status).toBe('done');
    expect(store.get('t1').data?.actionItems[0]?.description).toBe('ship');
  });

  it('run() transitions to error on rejection', async () => {
    installApi({ analyzeRun: vi.fn().mockRejectedValue(new Error('llm down')) });
    const { useAnalysisStore } = await import('../../../src/renderer/src/stores/analysis');
    const store = useAnalysisStore();
    await store.run('t1');
    expect(store.get('t1').status).toBe('error');
    expect(store.get('t1').error).toBe('llm down');
  });
});
