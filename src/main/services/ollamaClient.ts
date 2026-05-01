import { logger } from './logger.js';

export interface OllamaHealthResult {
  running: boolean;
  version?: string;
  models: string[];
}

export interface OllamaPullProgress {
  percent: number;
  status: string;
}

export interface OllamaPullOptions {
  onProgress?: (p: OllamaPullProgress) => void;
  signal?: AbortSignal;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  format?: 'json' | string;
  options?: Record<string, unknown>;
  // Top-level Ollama field (not inside `options`). Strings like '15m' tell
  // Ollama to keep the model resident in RAM/VRAM between calls.
  keepAlive?: string;
  signal?: AbortSignal;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaStreamChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  options?: Record<string, unknown>;
  keepAlive?: string;
  signal?: AbortSignal;
}

export interface OllamaChatChunk {
  content: string;
  done: boolean;
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${trimmed}${path.startsWith('/') ? path : `/${path}`}`;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function listModels(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(joinUrl(baseUrl, '/api/tags'));
    if (!res.ok) return [];
    const body = (await safeJson(res)) as { models?: Array<{ name?: string }> } | null;
    if (!body || !Array.isArray(body.models)) return [];
    return body.models
      .map((m) => (typeof m?.name === 'string' ? m.name : null))
      .filter((n): n is string => typeof n === 'string');
  } catch (err) {
    logger.debug('ollama listModels error', String(err));
    return [];
  }
}

export async function health(baseUrl: string): Promise<OllamaHealthResult> {
  let version: string | undefined;
  try {
    const res = await fetch(joinUrl(baseUrl, '/api/version'));
    if (!res.ok) return { running: false, models: [] };
    const body = (await safeJson(res)) as { version?: string } | null;
    if (body && typeof body.version === 'string') version = body.version;
  } catch (err) {
    logger.debug('ollama health error', String(err));
    return { running: false, models: [] };
  }
  const models = await listModels(baseUrl);
  const result: OllamaHealthResult = { running: true, models };
  if (version !== undefined) result.version = version;
  return result;
}

async function* iterateNdjson(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<unknown, void, void> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        throw new DOMException('Aborted', 'AbortError');
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nlIdx = buffer.indexOf('\n');
      while (nlIdx !== -1) {
        const line = buffer.slice(0, nlIdx).trim();
        buffer = buffer.slice(nlIdx + 1);
        if (line.length > 0) {
          try {
            yield JSON.parse(line);
          } catch (err) {
            logger.debug('ollama ndjson parse error', String(err));
          }
        }
        nlIdx = buffer.indexOf('\n');
      }
    }
    const tail = buffer.trim();
    if (tail.length > 0) {
      try {
        yield JSON.parse(tail);
      } catch (err) {
        logger.debug('ollama ndjson trailing parse error', String(err));
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

export async function pullModel(
  baseUrl: string,
  model: string,
  opts: OllamaPullOptions = {}
): Promise<void> {
  const res = await fetch(joinUrl(baseUrl, '/api/pull'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: model, stream: true }),
    signal: opts.signal
  });
  if (!res.ok || !res.body) {
    throw new Error(`Ollama pull failed: ${res.status} ${res.statusText}`);
  }
  for await (const chunk of iterateNdjson(res.body, opts.signal)) {
    const c = chunk as {
      status?: string;
      completed?: number;
      total?: number;
      error?: string;
    } | null;
    if (!c) continue;
    if (typeof c.error === 'string' && c.error.length > 0) {
      throw new Error(`Ollama pull error: ${c.error}`);
    }
    let percent = 0;
    if (typeof c.completed === 'number' && typeof c.total === 'number' && c.total > 0) {
      percent = Math.max(0, Math.min(100, Math.round((c.completed / c.total) * 100)));
    }
    opts.onProgress?.({ percent, status: typeof c.status === 'string' ? c.status : '' });
  }
}

export async function generate(
  baseUrl: string,
  req: OllamaGenerateRequest
): Promise<string> {
  // An empty prompt with format:'json' makes Ollama's llama.cpp worker log
  // [json.exception.parse_error.101] — fail fast on our side instead.
  if (!req.model || req.model.trim().length === 0) {
    throw new Error('Ollama generate: model is required');
  }
  if (!req.prompt || req.prompt.trim().length === 0) {
    throw new Error('Ollama generate: prompt is required');
  }
  const body: Record<string, unknown> = {
    model: req.model,
    prompt: req.prompt,
    stream: false
  };
  if (req.format !== undefined) body.format = req.format;
  if (req.options !== undefined) body.options = req.options;
  if (req.keepAlive !== undefined) body.keep_alive = req.keepAlive;

  const res = await fetch(joinUrl(baseUrl, '/api/generate'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: req.signal
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama generate failed: ${res.status} ${res.statusText} ${text}`);
  }
  const json = (await safeJson(res)) as { response?: string } | null;
  if (!json || typeof json.response !== 'string') {
    throw new Error('Ollama generate: missing response field');
  }
  return json.response;
}

export async function* streamChat(
  baseUrl: string,
  req: OllamaStreamChatRequest
): AsyncGenerator<OllamaChatChunk, void, void> {
  if (!req.model || req.model.trim().length === 0) {
    throw new Error('Ollama chat: model is required');
  }
  if (!Array.isArray(req.messages) || req.messages.length === 0) {
    throw new Error('Ollama chat: at least one message is required');
  }
  const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser || !lastUser.content || lastUser.content.trim().length === 0) {
    throw new Error('Ollama chat: latest user message must have non-empty content');
  }
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    stream: true
  };
  if (req.options !== undefined) body.options = req.options;
  if (req.keepAlive !== undefined) body.keep_alive = req.keepAlive;

  const res = await fetch(joinUrl(baseUrl, '/api/chat'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: req.signal
  });
  if (!res.ok || !res.body) {
    throw new Error(`Ollama chat failed: ${res.status} ${res.statusText}`);
  }

  for await (const raw of iterateNdjson(res.body, req.signal)) {
    const chunk = raw as {
      message?: { content?: string };
      done?: boolean;
      error?: string;
    } | null;
    if (!chunk) continue;
    if (typeof chunk.error === 'string' && chunk.error.length > 0) {
      throw new Error(`Ollama chat error: ${chunk.error}`);
    }
    const content =
      chunk.message && typeof chunk.message.content === 'string' ? chunk.message.content : '';
    const done = chunk.done === true;
    yield { content, done };
    if (done) return;
  }
}
