<script setup lang="ts">
import { ref, computed } from 'vue';
import { Key, Download } from 'lucide-vue-next';
import { useSystemStore } from '@/stores/system';
import { useSettingsStore } from '@/stores/settings';
import { useToast } from '@/composables/useToast';
import Button from './ui/Button.vue';
import Input from './ui/Input.vue';
import Label from './ui/Label.vue';
import Progress from './ui/Progress.vue';

const system = useSystemStore();
const settings = useSettingsStore();
const { error: errorToast, success } = useToast();

const tokenDraft = ref(settings.settings.huggingfaceToken ?? '');
const saving = ref(false);

const showBanner = computed(() => !system.pyannote.ready);
const downloading = computed(() => !!system.pyannoteDownload);
const link = 'https://huggingface.co/pyannote/speaker-diarization-3.1';

async function download() {
  saving.value = true;
  try {
    if (tokenDraft.value && tokenDraft.value !== settings.settings.huggingfaceToken) {
      await settings.save({ huggingfaceToken: tokenDraft.value });
    }
    const ready = await system.ensurePyannote();
    if (ready) success('Speaker diarization ready');
  } catch (e) {
    errorToast('Download failed', e instanceof Error ? e.message : String(e));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div
    v-if="showBanner"
    class="rounded-md border border-blue-500/40 bg-blue-500/10 p-4 text-sm space-y-3"
  >
    <div class="flex items-start gap-3">
      <Key class="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
      <div class="flex-1 space-y-1">
        <p class="font-medium">First-time setup: speaker diarization weights</p>
        <p class="text-muted-foreground text-xs">
          Download speaker-diarization weights (~150 MB). Requires a HuggingFace token (free) and
          acceptance of the pyannote license at
          <span class="font-mono break-all">{{ link }}</span>.
        </p>
      </div>
    </div>

    <div class="space-y-1.5">
      <Label for="hf-token">HuggingFace token</Label>
      <Input
        id="hf-token"
        v-model="tokenDraft"
        type="password"
        placeholder="hf_..."
        :disabled="saving || downloading"
      />
    </div>

    <div v-if="system.pyannoteDownload" class="space-y-1">
      <Progress :value="system.pyannoteDownload.percent" />
      <p class="text-xs text-muted-foreground">
        {{ system.pyannoteDownload.status }} — {{ Math.round(system.pyannoteDownload.percent) }}%
      </p>
    </div>

    <Button :disabled="saving || downloading || !tokenDraft.trim()" size="sm" @click="download">
      <Download class="h-3.5 w-3.5" />
      <span class="text-xs">Download weights</span>
    </Button>
  </div>
</template>
