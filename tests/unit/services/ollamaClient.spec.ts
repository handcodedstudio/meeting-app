import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import {
  health,
  listModels,
  pullModel,
  streamChat,
  generate
} from '../../../src/main/services/ollamaClient';

const BASE = 'http://localhost:11434';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => server.resetHandlers());

function ndjson(lines: unknown[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(enc.encode(JSON.stringify(line) + '\n'));
      }
      controller.close();
    }
  });
}

describe('health', () => {
  it('returns running:false on connection error', async () => {
    server.use(http.get(`${BASE}/api/version`, () => HttpResponse.error()));
    const result = await health(BASE);
    expect(result.running).toBe(false);
    expect(result.models).toEqual([]);
  });

  it('returns running:true with models on success', async () => {
    server.use(
      http.get(`${BASE}/api/version`, () => HttpResponse.json({ version: '0.1.42' })),
      http.get(`${BASE}/api/tags`, () =>
        HttpResponse.json({ models: [{ name: 'llama3.1:8b' }, { name: 'mistral:7b' }] })
      )
    );
    const result = await health(BASE);
    expect(result.running).toBe(true);
    expect(result.version).toBe('0.1.42');
    expect(result.models).toEqual(['llama3.1:8b', 'mistral:7b']);
  });

  it('returns running:false when /api/version returns non-2xx', async () => {
    server.use(http.get(`${BASE}/api/version`, () => new HttpResponse(null, { status: 503 })));
    const result = await health(BASE);
    expect(result.running).toBe(false);
  });
});

describe('listModels', () => {
  it('extracts the names from /api/tags', async () => {
    server.use(
      http.get(`${BASE}/api/tags`, () =>
        HttpResponse.json({ models: [{ name: 'a' }, { name: 'b' }, { notName: 'c' }] })
      )
    );
    const names = await listModels(BASE);
    expect(names).toEqual(['a', 'b']);
  });

  it('returns [] when /api/tags errors', async () => {
    server.use(http.get(`${BASE}/api/tags`, () => new HttpResponse(null, { status: 500 })));
    const names = await listModels(BASE);
    expect(names).toEqual([]);
  });
});

describe('pullModel', () => {
  it('reports computed percent then completes on success', async () => {
    server.use(
      http.post(
        `${BASE}/api/pull`,
        () =>
          new HttpResponse(
            ndjson([
              { status: 'downloading', completed: 50, total: 100 },
              { status: 'success' }
            ]),
            { status: 200, headers: { 'content-type': 'application/x-ndjson' } }
          )
      )
    );
    const progress: Array<{ percent: number; status: string }> = [];
    await pullModel(BASE, 'llama3.1:8b', { onProgress: (p) => progress.push(p) });
    expect(progress.length).toBe(2);
    expect(progress[0]?.percent).toBe(50);
    expect(progress[0]?.status).toBe('downloading');
    expect(progress[1]?.status).toBe('success');
  });

  it('throws when an error chunk is emitted', async () => {
    server.use(
      http.post(
        `${BASE}/api/pull`,
        () =>
          new HttpResponse(ndjson([{ error: 'no disk space' }]), {
            status: 200,
            headers: { 'content-type': 'application/x-ndjson' }
          })
      )
    );
    await expect(pullModel(BASE, 'm')).rejects.toThrowError(/no disk space/);
  });

  it('throws on non-2xx HTTP response', async () => {
    server.use(http.post(`${BASE}/api/pull`, () => new HttpResponse(null, { status: 404 })));
    await expect(pullModel(BASE, 'm')).rejects.toThrowError(/Ollama pull failed/);
  });
});

describe('streamChat', () => {
  it('yields decoded deltas and terminates on done:true', async () => {
    server.use(
      http.post(
        `${BASE}/api/chat`,
        () =>
          new HttpResponse(
            ndjson([
              { message: { content: 'Hello' } },
              { message: { content: ' world' } },
              { message: { content: '' }, done: true }
            ]),
            { status: 200, headers: { 'content-type': 'application/x-ndjson' } }
          )
      )
    );

    const collected: Array<{ content: string; done: boolean }> = [];
    for await (const chunk of streamChat(BASE, {
      model: 'llama3.1:8b',
      messages: [{ role: 'user', content: 'hi' }]
    })) {
      collected.push(chunk);
    }
    expect(collected.length).toBe(3);
    expect(collected.map((c) => c.content).join('')).toBe('Hello world');
    expect(collected.at(-1)?.done).toBe(true);
  });

  it('aborts the iterator when signal is already aborted before iteration', async () => {
    server.use(
      http.post(
        `${BASE}/api/chat`,
        () =>
          new HttpResponse(
            ndjson([
              { message: { content: 'a' } },
              { message: { content: 'b' }, done: true }
            ]),
            { status: 200, headers: { 'content-type': 'application/x-ndjson' } }
          )
      )
    );
    const ac = new AbortController();
    ac.abort();
    const iter = streamChat(BASE, {
      model: 'llama3.1:8b',
      messages: [{ role: 'user', content: 'go' }],
      signal: ac.signal
    });
    await expect(iter.next()).rejects.toThrow();
  });

  it('throws when chat returns non-2xx', async () => {
    server.use(http.post(`${BASE}/api/chat`, () => new HttpResponse(null, { status: 500 })));
    const iter = streamChat(BASE, {
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }]
    });
    await expect(iter.next()).rejects.toThrowError(/Ollama chat failed/);
  });
});

describe('generate', () => {
  it('returns the response field from /api/generate', async () => {
    server.use(
      http.post(`${BASE}/api/generate`, () => HttpResponse.json({ response: '{"ok":true}' }))
    );
    const out = await generate(BASE, { model: 'm', prompt: 'p', format: 'json' });
    expect(out).toBe('{"ok":true}');
  });

  it('throws when response field is missing', async () => {
    server.use(http.post(`${BASE}/api/generate`, () => HttpResponse.json({})));
    await expect(generate(BASE, { model: 'm', prompt: 'p' })).rejects.toThrowError(
      /missing response/
    );
  });

  it('throws on non-2xx status', async () => {
    server.use(http.post(`${BASE}/api/generate`, () => new HttpResponse('', { status: 502 })));
    await expect(generate(BASE, { model: 'm', prompt: 'p' })).rejects.toThrowError(
      /Ollama generate failed/
    );
  });
});
