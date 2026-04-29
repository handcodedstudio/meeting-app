import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol, fs as memfs } from 'memfs';
import { join } from 'node:path';
import type { Transcript } from '../../../src/shared/types/transcript';

const USER_DATA = '/tmp/test-userdata';
const TRANSCRIPTS_ROOT = `${USER_DATA}/transcripts`;

vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => USER_DATA,
    isPackaged: false
  },
  shell: { showItemInFolder: vi.fn() }
}));

type Rename = (oldPath: unknown, newPath: unknown) => Promise<void>;
const renameCalls: Array<[string, string]> = [];
const renameInterceptor: Rename = (a, b) => {
  renameCalls.push([String(a), String(b)]);
  return memfs.promises.rename(a as never, b as never);
};

vi.mock('node:fs', () => ({ ...memfs, default: memfs }));
vi.mock('node:fs/promises', () => ({
  ...memfs.promises,
  rename: (a: unknown, b: unknown) => renameInterceptor(a, b),
  default: { ...memfs.promises, rename: (a: unknown, b: unknown) => renameInterceptor(a, b) }
}));

function makeTranscript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    id: '01HXSAMPLEAAAAAAAAAAAAAAAA',
    schemaVersion: 1,
    title: 'Sample',
    sourceFile: {
      originalPath: '/tmp/sample.mp3',
      importedAt: '2026-04-28T09:00:00.000Z',
      sizeBytes: 1024,
      mime: 'audio/mpeg'
    },
    audio: { durationSec: 10 },
    language: 'en',
    modelSize: 'small.en',
    diarization: { backend: 'pyannote-3.1' },
    speakers: [{ id: 'SPEAKER_00', displayName: 'Speaker 1' }],
    turns: [],
    stats: { speakerCount: 1, wordCount: 0, turnCount: 0 },
    createdAt: '2026-04-28T09:00:00.000Z',
    updatedAt: '2026-04-28T09:00:00.000Z',
    ...overrides
  };
}

describe('storage', () => {
  beforeEach(() => {
    vol.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saveTranscript() then loadTranscript() round-trips through validation', async () => {
    const { saveTranscript, loadTranscript } = await import(
      '../../../src/main/services/storage'
    );
    const t = makeTranscript({ id: 't1' });
    const saved = await saveTranscript(t);
    expect(saved.updatedAt).not.toBe(t.updatedAt);
    const loaded = await loadTranscript('t1');
    expect(loaded?.id).toBe('t1');
    expect(loaded?.title).toBe('Sample');
  });

  it('returns null for missing transcripts', async () => {
    const { loadTranscript } = await import('../../../src/main/services/storage');
    const loaded = await loadTranscript('does-not-exist');
    expect(loaded).toBeNull();
  });

  it('listTranscripts() returns summaries sorted by createdAt descending', async () => {
    const { saveTranscript, listTranscripts } = await import(
      '../../../src/main/services/storage'
    );
    await saveTranscript(
      makeTranscript({ id: 'older', createdAt: '2026-04-01T00:00:00.000Z' })
    );
    await saveTranscript(
      makeTranscript({ id: 'newer', createdAt: '2026-04-29T00:00:00.000Z' })
    );
    const summaries = await listTranscripts();
    expect(summaries.map((s) => s.id)).toEqual(['newer', 'older']);
  });

  it('quarantines a transcript file with invalid JSON and returns null', async () => {
    const { loadTranscript } = await import('../../../src/main/services/storage');
    const dir = join(TRANSCRIPTS_ROOT, 'bad');
    memfs.mkdirSync(dir, { recursive: true });
    memfs.writeFileSync(join(dir, 'transcript.json'), '{not valid');

    const loaded = await loadTranscript('bad');
    expect(loaded).toBeNull();

    const after = memfs.readdirSync(dir) as string[];
    const quarantined = after.some((n) => n.startsWith('transcript.json.corrupt-'));
    expect(quarantined).toBe(true);
    expect(after.includes('transcript.json')).toBe(false);
  });

  it('quarantines a transcript file that fails schema validation', async () => {
    const { loadTranscript } = await import('../../../src/main/services/storage');
    const dir = join(TRANSCRIPTS_ROOT, 'badschema');
    memfs.mkdirSync(dir, { recursive: true });
    memfs.writeFileSync(
      join(dir, 'transcript.json'),
      JSON.stringify({ id: 1, schemaVersion: 'not-1' })
    );
    const loaded = await loadTranscript('badschema');
    expect(loaded).toBeNull();
    const after = memfs.readdirSync(dir) as string[];
    expect(after.some((n) => n.startsWith('transcript.json.corrupt-'))).toBe(true);
  });

  it('deleteTranscript() removes the directory recursively', async () => {
    const { saveTranscript, deleteTranscript } = await import(
      '../../../src/main/services/storage'
    );
    await saveTranscript(makeTranscript({ id: 'doomed' }));
    expect(memfs.existsSync(join(TRANSCRIPTS_ROOT, 'doomed'))).toBe(true);
    await deleteTranscript('doomed');
    expect(memfs.existsSync(join(TRANSCRIPTS_ROOT, 'doomed'))).toBe(false);
  });

  it('atomic write: rename source path is the *.tmp file, not the destination', async () => {
    renameCalls.length = 0;
    const { saveTranscript } = await import('../../../src/main/services/storage');
    await saveTranscript(makeTranscript({ id: 'atomic' }));
    expect(renameCalls.length).toBeGreaterThan(0);
    const last = renameCalls[renameCalls.length - 1]!;
    expect(last[0]).toMatch(/transcript\.json\.tmp$/);
    expect(last[1]).toMatch(/transcript\.json$/);
  });

  it('listTranscripts() skips entries whose transcript.json fails to load', async () => {
    const { listTranscripts, saveTranscript } = await import(
      '../../../src/main/services/storage'
    );
    await saveTranscript(makeTranscript({ id: 'good', createdAt: '2026-04-01T00:00:00.000Z' }));
    const badDir = join(TRANSCRIPTS_ROOT, 'broken');
    memfs.mkdirSync(badDir, { recursive: true });
    memfs.writeFileSync(join(badDir, 'transcript.json'), 'not json');
    const summaries = await listTranscripts();
    expect(summaries.map((s) => s.id)).toEqual(['good']);
  });
});
