import { useToast } from './useToast';

export async function ipcSafe<T>(fn: () => Promise<T>, errorTitle = 'Something went wrong'): Promise<T | null> {
  const { error } = useToast();
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error(errorTitle, msg);
    return null;
  }
}

export function useIpc() {
  return { ipcSafe };
}
