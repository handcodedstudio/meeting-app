import { ref } from 'vue';

export type ToastVariant = 'default' | 'success' | 'error';

export interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant: ToastVariant;
}

const toasts = ref<ToastItem[]>([]);
let counter = 0;

function dismiss(id: string) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

function push(item: Omit<ToastItem, 'id'>): string {
  const id = `t-${++counter}`;
  toasts.value = [...toasts.value, { ...item, id }];
  setTimeout(() => dismiss(id), 4000);
  return id;
}

export function useToast() {
  return {
    toasts,
    dismiss,
    toast: (item: { title?: string; description?: string; variant?: ToastVariant }) =>
      push({ variant: 'default', ...item }),
    success: (title: string, description?: string) =>
      push({ title, description, variant: 'success' }),
    error: (title: string, description?: string) =>
      push({ title, description, variant: 'error' })
  };
}
