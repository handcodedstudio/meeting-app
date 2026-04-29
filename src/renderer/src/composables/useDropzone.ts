import { ref } from 'vue';

const DEFAULT_ACCEPT = ['.mp3', '.mp4', '.wav', '.m4a'];

export interface DropzoneOptions {
  accept?: string[];
  onFile: (filePath: string, file: File) => void;
  onReject?: (reason: string) => void;
}

function resolveFilePath(file: File): string {
  // Electron 32+ removed the deprecated `File.path`. The replacement is
  // `webUtils.getPathForFile(file)`, exposed by our preload bridge.
  try {
    return window.api?.getPathForFile?.(file) ?? '';
  } catch {
    return '';
  }
}

export function useDropzone(options: DropzoneOptions) {
  const dragOver = ref(false);
  const accept = options.accept ?? DEFAULT_ACCEPT;

  function isAcceptable(name: string): boolean {
    const lower = name.toLowerCase();
    return accept.some((ext) => lower.endsWith(ext));
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver.value = false;
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    if (!isAcceptable(file.name)) {
      options.onReject?.(`Unsupported file type. Use: ${accept.join(', ')}`);
      return;
    }
    const path = resolveFilePath(file);
    if (!path) {
      options.onReject?.('Could not resolve file path. Are you running in Electron?');
      return;
    }
    options.onFile(path, file);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver.value = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragOver.value = false;
  }

  const bind = {
    onDrop: handleDrop,
    onDragover: handleDragOver,
    onDragleave: handleDragLeave,
    onDragenter: handleDragOver
  };

  return { dragOver, bind, accept };
}
