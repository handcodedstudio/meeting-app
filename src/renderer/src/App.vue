<script setup lang="ts">
import { RouterView, RouterLink, useRoute } from 'vue-router';
import { Mic, Library, Settings as SettingsIcon } from 'lucide-vue-next';
import { computed, onMounted } from 'vue';
import Toaster from '@/components/ui/Toaster.vue';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/composables/useTheme';

const route = useRoute();
const isLibrary = computed(() => route.name === 'library');
const isSettings = computed(() => route.name === 'settings');

const settings = useSettingsStore();
useTheme();

onMounted(() => {
  void settings.load();
});
</script>

<template>
  <div class="h-screen flex flex-col bg-background text-foreground">
    <header
      class="border-b border-border pl-20 pr-4 py-2 flex items-center gap-4 select-none"
      style="-webkit-app-region: drag"
    >
      <RouterLink
        :to="{ name: 'library' }"
        class="flex items-center gap-2 text-sm font-semibold tracking-tight"
        style="-webkit-app-region: no-drag"
      >
        <Mic class="h-4 w-4" />
        Local Meeting Transcriber
      </RouterLink>
      <nav
        class="ml-auto flex items-center gap-1 text-sm"
        style="-webkit-app-region: no-drag"
      >
        <RouterLink
          :to="{ name: 'library' }"
          :class="cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors',
            isLibrary ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
          )"
        >
          <Library class="h-3.5 w-3.5" />
          <span class="text-xs">Library</span>
        </RouterLink>
        <RouterLink
          :to="{ name: 'settings' }"
          :class="cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors',
            isSettings ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
          )"
        >
          <SettingsIcon class="h-3.5 w-3.5" />
          <span class="text-xs">Settings</span>
        </RouterLink>
      </nav>
    </header>
    <main class="flex-1 overflow-hidden">
      <RouterView />
    </main>
    <Toaster />
  </div>
</template>
