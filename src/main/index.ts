import { app, BrowserWindow, session, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const isDev = !!process.env.ELECTRON_RENDERER_URL;
// Suppress the "Insecure CSP" devtools warning in dev. Vite's HMR runtime needs
// 'unsafe-eval', which is fine for development but trips Electron's heuristic.
// Production sets a strict CSP via webRequest.onHeadersReceived (see applyCsp).
if (isDev) process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

import { registerIpcHandlers } from './ipc/index.js';
import { getSidecar } from './services/sidecar.js';
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
            "connect-src 'self';"
        ]
      }
    });
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
      sandbox: false
    }
  });

  win.on('ready-to-show', () => {
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
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

app.on('before-quit', () => {
  // Tear down the long-lived Python child so it doesn't outlive the app.
  try {
    getSidecar().dispose();
  } catch (err) {
    logger.warn('sidecar dispose on quit failed', String(err));
  }
});

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', reason);
});
