import { getCurrentScope, onScopeDispose, ref } from 'vue';

export function useClipboard() {
  const copied = ref(false);
  let timer: number | null = null;

  function clearTimer() {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      copied.value = true;
      clearTimer();
      timer = window.setTimeout(() => {
        copied.value = false;
        timer = null;
      }, 1500);
      return true;
    } catch {
      copied.value = false;
      return false;
    }
  }

  // Clear the timer on component unmount so a copied "Copied!" flash doesn't
  // resolve into a Vue warning about a setter on an unmounted ref.
  if (getCurrentScope()) {
    onScopeDispose(clearTimer);
  }

  return { copied, copy };
}
