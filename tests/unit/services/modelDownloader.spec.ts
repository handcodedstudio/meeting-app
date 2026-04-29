import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { vol, fs as memfs } from 'memfs';
import { join } from 'node:path';

const USER_DATA = '/tmp/test-userdata';
const PYANNOTE_CACHE = `${USER_DATA}/models/pyannote`;
const SNAP_DIR = join(
  PYANNOTE_CACHE,
  'hub',
  'models--pyannote--speaker-diarization-3.1',
  'snapshots',
  'main'
);

vi.mock('electron', () => ({
  app: { getPath: () => USER_DATA, isPackaged: false },
  shell: { showItemInFolder: vi.fn() }
}));

vi.mock('node:fs', () => ({ ...memfs, default: memfs }));
vi.mock('node:fs/promises', () => ({ ...memfs.promises, default: memfs.promises }));

const HF_API = 'https://huggingface.co/api/models/pyannote/speaker-diarization-3.1/tree/main';
const HF_RESOLVE = 'https://huggingface.co/pyannote/speaker-diarization-3.1/resolve/main';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

beforeEach(() => {
  server.resetHandlers();
  vol.reset();
});

describe('ensurePyannoteWeights', () => {
  it('rejects with the licence-acceptance hint when no token is provided', async () => {
    const { ensurePyannoteWeights } = await import('../../../src/main/services/modelDownloader');
    await expect(ensurePyannoteWeights({})).rejects.toThrowError(
      /HuggingFace token missing|Accept the licence/
    );
  });

  it('rejects with the same hint when HF returns 401', async () => {
    server.use(http.get(HF_API, () => new HttpResponse(null, { status: 401 })));
    const { ensurePyannoteWeights } = await import('../../../src/main/services/modelDownloader');
    await expect(ensurePyannoteWeights({ token: 'hf_bad' })).rejects.toThrowError(
      /Unauthorised|Accept the licence/
    );
  });

  it('downloads the file list, streams bytes, and reports cumulative progress', async () => {
    const fileBody = Buffer.from('hello pyannote');
    server.use(
      http.get(HF_API, () =>
        HttpResponse.json([
          { type: 'file', path: 'config.yaml', size: fileBody.length },
          { type: 'directory', path: 'subdir' }
        ])
      ),
      http.get(
        `${HF_RESOLVE}/config.yaml`,
        () =>
          new HttpResponse(fileBody, {
            status: 200,
            headers: { 'content-type': 'application/octet-stream' }
          })
      )
    );

    const { ensurePyannoteWeights } = await import('../../../src/main/services/modelDownloader');
    const events: Array<{ percent: number; status: string }> = [];
    const result = await ensurePyannoteWeights({
      token: 'hf_xxx',
      onProgress: (p) => events.push(p)
    });
    expect(result.ready).toBe(true);
    expect(result.cachedAt).toBe(SNAP_DIR);
    expect(events[0]?.status).toContain('listing');
    expect(events.at(-1)?.percent).toBe(100);
    const written = memfs.readFileSync(join(SNAP_DIR, 'config.yaml'));
    expect(written.toString('utf8')).toBe('hello pyannote');
    expect(memfs.existsSync(join(PYANNOTE_CACHE, '.installed'))).toBe(true);
  });

  it('short-circuits when the cache contains every required file (no fetch)', async () => {
    // The cache check requires *every* expected file (config.yaml + handler.py
    // + README.md). A previous bug used .some(Boolean), which let a partially
    // populated cache pass.
    let apiHits = 0;
    server.use(
      http.get(HF_API, () => {
        apiHits += 1;
        return HttpResponse.json([]);
      })
    );

    memfs.mkdirSync(SNAP_DIR, { recursive: true });
    memfs.writeFileSync(join(SNAP_DIR, 'config.yaml'), 'pre-existing');
    memfs.writeFileSync(join(SNAP_DIR, 'handler.py'), '# pyannote handler');
    memfs.writeFileSync(join(SNAP_DIR, 'README.md'), '# pyannote');

    const { ensurePyannoteWeights } = await import('../../../src/main/services/modelDownloader');
    const result = await ensurePyannoteWeights({ token: 'hf_xxx' });
    expect(result.ready).toBe(true);
    expect(apiHits).toBe(0);
  });

  it('rejects when a file download returns 401', async () => {
    server.use(
      http.get(HF_API, () =>
        HttpResponse.json([{ type: 'file', path: 'config.yaml', size: 10 }])
      ),
      http.get(`${HF_RESOLVE}/config.yaml`, () => new HttpResponse(null, { status: 401 }))
    );
    const { ensurePyannoteWeights } = await import('../../../src/main/services/modelDownloader');
    await expect(ensurePyannoteWeights({ token: 'hf_xxx' })).rejects.toThrowError(
      /Unauthorised|Accept the licence/
    );
  });
});
