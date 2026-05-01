<script setup lang="ts">
import { computed } from 'vue';
import { AlertCircle, RefreshCw, Download } from 'lucide-vue-next';
import { useSystemStore } from '@/stores/system';
import { useSettingsStore } from '@/stores/settings';
import { useToast } from '@/composables/useToast';
import Button from './ui/Button.vue';
import Progress from './ui/Progress.vue';
import CopyButton from './CopyButton.vue';

const system = useSystemStore();
const settings = useSettingsStore();
const { error: errorToast } = useToast();

const installCmd = 'brew install ollama && ollama serve';

const modelMissing = computed(() => {
  if (!system.ollama.running) return false;
  return !system.ollama.models.includes(settings.settings.ollamaModel);
});

const showBanner = computed(() => !system.ollama.running || modelMissing.value);

async function refresh() {
  await system.pollAll();
}

async function pull() {
  try {
    await system.pullOllamaModel(settings.settings.ollamaModel);
  } catch (e) {
    errorToast('Pull failed', e instanceof Error ? e.message : String(e));
  }
}
</script>

<template>
  <div
    v-if="showBanner"
    class="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
  >
    <div
      v-if="!system.ollama.running"
      class="flex items-start gap-3"
    >
      <AlertCircle class="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
      <div class="flex-1 space-y-2">
        <p class="font-medium">Ollama is not running</p>
        <p class="text-muted-foreground text-xs">
          Analysis and chat need a local Ollama server. Install &amp; start it with:
        </p>
        <div class="flex items-center gap-2">
          <code class="flex-1 rounded bg-background border border-border px-2 py-1 text-xs font-mono">
            {{ installCmd }}
          </code>
          <CopyButton
            :text="installCmd"
            variant="outline"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          @click="refresh"
        >
          <RefreshCw class="h-3.5 w-3.5" />
          <span class="text-xs">Re-check</span>
        </Button>
      </div>
    </div>
    <div
      v-else-if="modelMissing"
      class="flex items-start gap-3"
    >
      <Download class="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
      <div class="flex-1 space-y-2">
        <p class="font-medium">Model "{{ settings.settings.ollamaModel }}" is not pulled</p>
        <p class="text-muted-foreground text-xs">
          Pull it now to enable analysis and chat. This may take several minutes on first run.
        </p>
        <div
          v-if="system.ollamaPull"
          class="space-y-1"
        >
          <Progress :value="system.ollamaPull.percent" />
          <p class="text-xs text-muted-foreground">
            {{ system.ollamaPull.status }} — {{ Math.round(system.ollamaPull.percent) }}%
          </p>
        </div>
        <Button
          v-else
          size="sm"
          @click="pull"
        >
          <Download class="h-3.5 w-3.5" />
          <span class="text-xs">Pull {{ settings.settings.ollamaModel }}</span>
        </Button>
      </div>
    </div>
  </div>
</template>
