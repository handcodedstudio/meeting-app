import { app, BrowserWindow, protocol, session, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { loadTranscript } from './services/storage.js';
import { isValidUlid } from './utils/ulid.js';

const isDev = !!process.env.ELECTRON_RENDERER_URL;
// Suppress the "Insecure CSP" devtools warning in dev. Vite's HMR runtime needs
// 'unsafe-eval', which is fine for development but trips Electron's heuristic.
// Production sets a strict CSP via webRequest.onHeadersReceived (see applyCsp).
if (isDev) process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

import { registerIpcHandlers } from './ipc/index.js';
import { logger } from './services/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function applyCsp() {
  // Production-only strict CSP. In dev, Vite's HMR runtime needs 'unsafe-eval'
  // and connections to its WebSocket on a non-self origin if the port shifts.
  if (isDev) return;
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; " +
            "media-src 'self' media:; " +
            "connect-src 'self' media:;"
        ]
      }
    });
  });
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, supportFetchAPI: true, stream: true, secure: true }
  }
]);

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.webm': 'audio/webm'
};

async function serveAudioFile(filePath: string): Promise<Response> {
  const ext = extname(filePath).toLowerCase();
  const contentType = AUDIO_MIME_BY_EXT[ext] ?? 'application/octet-stream';
  try {
    const s = await stat(filePath);
    if (!s.isFile()) {
      return new Response(`not a file: ${filePath}`, { status: 404 });
    }
  } catch {
    return new Response(`source audio missing: ${filePath}`, { status: 404 });
  }
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch (err) {
    return new Response(`read failed: ${String(err)}`, { status: 500 });
  }
  // Copy into a fresh ArrayBuffer to avoid SharedArrayBuffer typing on Buffer.
  const body = new Uint8Array(buffer.byteLength);
  body.set(buffer);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'no-store'
    }
  });
}

function registerMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'audio') return new Response('not found', { status: 404 });
      const id = url.pathname.replace(/^\/+/, '');
      if (!isValidUlid(id)) return new Response('invalid id', { status: 400 });
      const transcript = await loadTranscript(id);
      if (!transcript) return new Response('not found', { status: 404 });
      return await serveAudioFile(transcript.sourceFile.originalPath);
    } catch (err) {
      logger.error('media protocol error', { url: request.url, error: String(err) });
      return new Response('error', { status: 500 });
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'Local Meeting Transcriber',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox:false is required because the preload is built as ESM (.mjs).
      // Sandbox mode forces CJS preloads. contextIsolation + nodeIntegration:false
      // still keep the renderer isolated from Node and the main process.
      sandbox: false,
      devTools: false
    }
  });

  win.on('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

void app.whenReady().then(() => {
  applyCsp();
  registerMediaProtocol();
  registerIpcHandlers();
  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', reason);
});
