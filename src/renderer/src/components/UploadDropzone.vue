<script setup lang="ts">
import { ref, computed } from 'vue';
import { UploadCloud } from 'lucide-vue-next';
import { useDropzone } from '@/composables/useDropzone';
import { useToast } from '@/composables/useToast';
import { cn } from '@/lib/utils';

const props = defineProps<{
  disabled?: boolean;
  message?: string;
}>();

const emit = defineEmits<{ (e: 'file', filePath: string, file: File): void }>();

const fileInput = ref<HTMLInputElement | null>(null);
const { error } = useToast();

const { dragOver, bind, accept } = useDropzone({
  onFile: (path, file) => emit('file', path, file),
  onReject: (reason) => error('Upload error', reason)
});

const acceptAttr = accept.join(',');

function browse() {
  if (props.disabled) return;
  fileInput.value?.click();
}

function onPick(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  let path = '';
  try {
    path = window.api?.getPathForFile?.(file) ?? '';
  } catch {
    path = '';
  }
  if (!path) {
    error('Upload error', 'Could not resolve file path. Are you running in Electron?');
    target.value = '';
    return;
  }
  emit('file', path, file);
  target.value = '';
}

const wrapperClass = computed(() =>
  cn(
    'group relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer',
    dragOver.value
      ? 'border-primary bg-primary/5'
      : 'border-border bg-muted/30 hover:bg-muted/50',
    props.disabled ? 'opacity-50 pointer-events-none' : ''
  )
);
</script>

<template>
  <div :class="wrapperClass" v-bind="bind" @click="browse" role="button" tabindex="0">
    <UploadCloud class="h-8 w-8 text-muted-foreground" />
    <p class="text-sm font-medium">{{ props.message ?? 'Drop audio to transcribe' }}</p>
    <p class="text-xs text-muted-foreground">
      or click to browse — {{ accept.join(', ') }}
    </p>
    <input
      ref="fileInput"
      type="file"
      class="hidden"
      :accept="acceptAttr"
      @change="onPick"
    />
  </div>
</template>
