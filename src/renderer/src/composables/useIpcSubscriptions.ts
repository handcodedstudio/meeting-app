/**
 * Wires up one or more `window.api.on*` push subscriptions inside a Pinia
 * setup-store and returns a single `dispose()` that tears them all down.
 *
 * Also chains `import.meta.hot.dispose` automatically so HMR doesn't double-bind.
 *
 * Usage:
 *   const dispose = useIpcSubscriptions((api) => [
 *     api.onTranscribeProgress((p) => { ... }),
 *     api.onTranscribeDone((p) => { ... })
 *   ]);
 *
 *   return { ..., dispose };
 */
export function useIpcSubscriptions(
  bindFn: (api: Window['api']) => Array<() => void>
): () => void {
  const api = typeof window !== 'undefined' ? window.api : undefined;
  const unsubs: Array<() => void> = api ? bindFn(api) : [];

  function dispose() {
    while (unsubs.length > 0) {
      const fn = unsubs.pop();
      try {
        fn?.();
      } catch {
        /* ignore */
      }
    }
  }

  if (import.meta.hot) {
    import.meta.hot.dispose(dispose);
  }

  return dispose;
}
