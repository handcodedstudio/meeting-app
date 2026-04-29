import { watch, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

function applyDarkClass(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

export function useTheme(): void {
  const settings = useSettingsStore();
  const { settings: s } = storeToRefs(settings);

  const mql = window.matchMedia('(prefers-color-scheme: dark)');

  function resolve(): boolean {
    const t = s.value.theme;
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return mql.matches;
  }

  function update(): void {
    applyDarkClass(resolve());
  }

  update();

  const onMqlChange = (): void => {
    if (s.value.theme === 'system') update();
  };
  mql.addEventListener('change', onMqlChange);

  watch(() => s.value.theme, update);

  onBeforeUnmount(() => {
    mql.removeEventListener('change', onMqlChange);
  });
}
