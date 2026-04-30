<script setup lang="ts">
import { onMounted, ref, computed, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useSettingsStore } from '@/stores/settings';
import { useSystemStore } from '@/stores/system';
import { useTranscriptsStore } from '@/stores/transcripts';
import { useToast } from '@/composables/useToast';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import Switch from '@/components/ui/Switch.vue';
import Card from '@/components/ui/Card.vue';
import CardHeader from '@/components/ui/CardHeader.vue';
import CardTitle from '@/components/ui/CardTitle.vue';
import CardContent from '@/components/ui/CardContent.vue';
import Badge from '@/components/ui/Badge.vue';
import Separator from '@/components/ui/Separator.vue';
import { ArrowLeft, RefreshCw, FolderOpen, Save, Trash2, Loader2 } from 'lucide-vue-next';
import type { AppSettings } from '@shared/types/settings';
import type { WhisperModelSize } from '@shared/types/transcript';
import type { ResourceInfo, ResourceKind } from '@shared/types/ipc';
import { formatBytes } from '@/lib/format';

const router = useRouter();
const settings = useSettingsStore();
const system = useSystemStore();
const transcripts = useTranscriptsStore();
const { error: errorToast, success } = useToast();

const draft = reactive<{
  ollamaUrl: string;
  ollamaModel: string;
  whisperModelSize: WhisperModelSize;
  language: AppSettings['language'];
  theme: AppSettings['theme'];
  autoPullOllamaModel: boolean;
  vadEnabled: boolean;
}>({
  ollamaUrl: '',
  ollamaModel: '',
  whisperModelSize: 'small.en',
  language: 'en',
  theme: 'system',
  autoPullOllamaModel: true,
  vadEnabled: true
});

const saving = ref(false);

const resources = ref<ResourceInfo[]>([]);
const resourcesLoading = ref(false);
const resourcesDeleting = ref<ResourceKind | null>(null);

async function loadResources() {
  resourcesLoading.value = true;
  try {
    resources.value = await window.api.resourcesList();
  } catch (e) {
    errorToast('Could not list resources', e instanceof Error ? e.message : String(e));
  } finally {
    resourcesLoading.value = false;
  }
}

async function deleteResource(r: ResourceInfo) {
  if (!r.removable) {
    errorToast('Cannot delete', r.reasonNotRemovable ?? 'Bundled resource.');
    return;
  }
  if (!r.exists) return;
  const ok = window.confirm(
    `Delete ${r.label}?\n\n${r.path}\n\nFrees ${formatBytes(r.sizeBytes)}. ` +
      'Re-run "npm run fetch:resources" to restore.'
  );
  if (!ok) return;
  resourcesDeleting.value = r.kind;
  try {
    const updated = await window.api.resourcesDelete({ kind: r.kind });
    resources.value = resources.value.map((x) => (x.kind === r.kind ? updated : x));
    success(`${r.label} deleted`);
  } catch (e) {
    errorToast('Delete failed', e instanceof Error ? e.message : String(e));
  } finally {
    resourcesDeleting.value = null;
  }
}

const whisperOptions: WhisperModelSize[] = [
  'tiny.en',
  'base.en',
  'small.en',
  'medium.en',
  'small',
  'medium',
  'large-v3'
];

function syncDraftFromStore() {
  const s = settings.settings;
  draft.ollamaUrl = s.ollamaUrl;
  draft.ollamaModel = s.ollamaModel;
  draft.whisperModelSize = s.whisperModelSize;
  draft.language = s.language;
  draft.theme = s.theme;
  draft.autoPullOllamaModel = s.autoPullOllamaModel;
  draft.vadEnabled = s.vadEnabled;
}

onMounted(async () => {
  await settings.load();
  syncDraftFromStore();
  await Promise.allSettled([system.pollAll(), transcripts.refresh(), loadResources()]);
});

const dirty = computed(() => {
  const s = settings.settings;
  return (
    draft.ollamaUrl !== s.ollamaUrl ||
    draft.ollamaModel !== s.ollamaModel ||
    draft.whisperModelSize !== s.whisperModelSize ||
    draft.language !== s.language ||
    draft.theme !== s.theme ||
    draft.autoPullOllamaModel !== s.autoPullOllamaModel ||
    draft.vadEnabled !== s.vadEnabled
  );
});

async function saveAll() {
  saving.value = true;
  try {
    await settings.save({
      ollamaUrl: draft.ollamaUrl.trim(),
      ollamaModel: draft.ollamaModel.trim(),
      whisperModelSize: draft.whisperModelSize,
      language: draft.language,
      theme: draft.theme,
      autoPullOllamaModel: draft.autoPullOllamaModel,
      vadEnabled: draft.vadEnabled
    });
    success('Settings saved');
    syncDraftFromStore();
  } catch (e) {
    errorToast('Save failed', e instanceof Error ? e.message : String(e));
  } finally {
    saving.value = false;
  }
}

async function reveal() {
  const latest = transcripts.summaries[0];
  if (!latest) {
    errorToast('No transcripts', 'There is nothing to reveal yet.');
    return;
  }
  try {
    await window.api.fsReveal({ id: latest.id });
  } catch (e) {
    errorToast('Reveal failed', e instanceof Error ? e.message : String(e));
  }
}

function back() {
  router.push({ name: 'library' });
}
</script>

<template>
  <section class="h-full overflow-y-auto px-6 py-6">
    <div class="mx-auto max-w-2xl space-y-6">
      <div class="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Back" @click="back">
          <ArrowLeft class="h-4 w-4" />
        </Button>
        <h1 class="text-base font-semibold">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ollama</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex items-center gap-2 text-sm">
            <span class="text-muted-foreground">Status:</span>
            <Badge v-if="system.ollama.running" variant="success">
              Running{{ system.ollama.version ? ` · v${system.ollama.version}` : '' }}
            </Badge>
            <Badge v-else variant="destructive">Not running</Badge>
            <Button variant="ghost" size="sm" :disabled="system.polling" @click="system.pollAll">
              <RefreshCw class="h-3 w-3" :class="system.polling ? 'animate-spin' : ''" />
              <span class="text-xs">Re-check</span>
            </Button>
          </div>

          <div class="space-y-1.5">
            <Label for="ollama-url">Ollama URL</Label>
            <Input
              id="ollama-url"
              v-model="draft.ollamaUrl"
              :invalid="!!settings.validation.ollamaUrl"
            />
            <p v-if="settings.validation.ollamaUrl" class="text-xs text-destructive">
              {{ settings.validation.ollamaUrl }}
            </p>
          </div>

          <div class="space-y-1.5">
            <Label for="ollama-model">Model</Label>
            <Input
              id="ollama-model"
              v-model="draft.ollamaModel"
              :invalid="!!settings.validation.ollamaModel"
            />
            <p v-if="settings.validation.ollamaModel" class="text-xs text-destructive">
              {{ settings.validation.ollamaModel }}
            </p>
            <p v-if="system.ollama.models.length > 0" class="text-xs text-muted-foreground">
              Detected: {{ system.ollama.models.join(', ') }}
            </p>
            <p v-else-if="system.ollama.running" class="text-xs text-muted-foreground">
              No models pulled yet.
            </p>
          </div>

          <div class="flex items-center justify-between gap-4">
            <div class="space-y-0.5">
              <Label for="auto-pull">Auto-pull missing model</Label>
              <p class="text-xs text-muted-foreground">
                Automatically download the configured model when running Analyze.
              </p>
            </div>
            <Switch
              id="auto-pull"
              v-model="draft.autoPullOllamaModel"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transcription</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-1.5">
            <Label for="whisper-size">Whisper model size</Label>
            <select
              id="whisper-size"
              v-model="draft.whisperModelSize"
              class="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option v-for="m in whisperOptions" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <Label for="language">Language</Label>
            <select
              id="language"
              v-model="draft.language"
              class="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="en">English</option>
              <option value="auto">Auto-detect</option>
            </select>
          </div>

          <div class="flex items-center justify-between gap-4">
            <div class="space-y-0.5">
              <Label for="vad-enabled">Skip silent regions</Label>
              <p class="text-xs text-muted-foreground">
                Detect speech with Silero VAD and skip silence. Faster on long meetings; turn off if speech is being clipped.
              </p>
            </div>
            <Switch id="vad-enabled" v-model="draft.vadEnabled" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-1.5">
            <Label for="theme">Theme</Label>
            <select
              id="theme"
              v-model="draft.theme"
              class="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
        </CardHeader>
        <CardContent class="space-y-5">
          <div>
            <Button variant="outline" size="sm" @click="reveal">
              <FolderOpen class="h-3.5 w-3.5" />
              <span class="text-xs">Open transcripts folder</span>
            </Button>
            <p class="mt-2 text-xs text-muted-foreground">
              Reveals the most recent transcript folder in Finder.
            </p>
          </div>

          <Separator />

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">Downloaded resources</p>
                <p class="text-xs text-muted-foreground">
                  Free disk space by deleting models or runtimes. They'll be re-fetched as needed.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                :disabled="resourcesLoading"
                @click="loadResources"
              >
                <RefreshCw class="h-3 w-3" :class="resourcesLoading ? 'animate-spin' : ''" />
                <span class="text-xs">Refresh</span>
              </Button>
            </div>

            <div class="rounded-md border border-border divide-y divide-border">
              <div
                v-for="r in resources"
                :key="r.kind"
                class="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium">{{ r.label }}</p>
                    <Badge v-if="!r.exists" variant="secondary">Not present</Badge>
                  </div>
                  <p class="text-xs text-muted-foreground truncate" :title="r.path">{{ r.path }}</p>
                  <p v-if="!r.removable && r.exists" class="text-xs text-amber-600">
                    {{ r.reasonNotRemovable }}
                  </p>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <span class="text-xs tabular-nums text-muted-foreground">
                    {{ r.exists ? formatBytes(r.sizeBytes) : '—' }}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="!r.removable || !r.exists || resourcesDeleting === r.kind"
                    @click="deleteResource(r)"
                  >
                    <Loader2 v-if="resourcesDeleting === r.kind" class="h-3 w-3 animate-spin" />
                    <Trash2 v-else class="h-3 w-3" />
                    <span class="text-xs">Delete</span>
                  </Button>
                </div>
              </div>
              <div
                v-if="!resourcesLoading && resources.length === 0"
                class="px-3 py-4 text-center text-xs text-muted-foreground"
              >
                No resources tracked.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div class="flex justify-end gap-2">
        <Button :disabled="!dirty || saving" @click="saveAll">
          <Save class="h-3.5 w-3.5" />
          <span class="text-xs">Save all</span>
        </Button>
      </div>
    </div>
  </section>
</template>
