import { createRouter, createMemoryHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'library',
    component: () => import('./views/LibraryView.vue')
  },
  {
    path: '/transcripts/:id',
    name: 'transcript',
    component: () => import('./views/TranscriptDetailView.vue'),
    props: true
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('./views/SettingsView.vue')
  }
];

export const router = createRouter({
  history: createMemoryHistory(),
  routes
});
