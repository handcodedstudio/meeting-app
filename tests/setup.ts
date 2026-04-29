// Vitest global setup. Stub the preload `window.api` surface so renderer
// stores and composables can be unit-tested without an Electron host.
import { vi } from 'vitest';

const g = globalThis as { window?: Window & { api?: unknown } };
if (g.window && !('api' in g.window)) {
  Object.defineProperty(g.window, 'api', {
    value: new Proxy(
      {},
      {
        get() {
          return vi.fn(() => Promise.reject(new Error('window.api stub: configure with vi.mock or vi.spyOn')));
        }
      }
    ),
    writable: true,
    configurable: true
  });
}
