/**
 * Wires up one or more `window.api.on*` push subscriptions inside a Pinia
 * setup-store and returns a single `dispose()` that tears them all down.
 *
 * IMPORTANT — HMR cleanup must be wired in the *caller's* module, because
 * `import.meta` is module-scoped:
 *
 *   const dispose = useIpcSubscriptions((api) => [
 *     api.onTranscribeProgress((p) => { ... }),
 *     api.onTranscribeDone((p) => { ... })
 *   ]);
 *   if (import.meta.hot) import.meta.hot.dispose(dispose);
 *
 * If you put `import.meta.hot.dispose` inside this composable instead, it
 * registers on this file's hot record — which doesn't fire when the *store*
 * file reloads — so listeners accumulate every HMR cycle and their closures
 * retain references to old state. That can leak gigabytes within a long dev
 * session.
 */
export function useIpcSubscriptions(
  bindFn: (api: Window['api']) => Array<() => void>
): () => void {
  const api = typeof window !== 'undefined' ? window.api : undefined;
  const unsubs: Array<() => void> = api ? bindFn(api) : [];

  return function dispose() {
    while (unsubs.length > 0) {
      const fn = unsubs.pop();
      try {
        fn?.();
      } catch {
        /* ignore */
      }
    }
  };
}
