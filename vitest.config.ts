import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main')
    }
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/unit/**/*.spec.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/main/services/**/*.ts',
        'src/main/prompts/**/*.ts',
        'src/main/parsers/**/*.ts',
        'src/renderer/src/stores/**/*.ts',
        'src/renderer/src/lib/**/*.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80
      }
    }
  }
});
