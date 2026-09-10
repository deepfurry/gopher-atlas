import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./apps/admin/src', import.meta.url)) },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    include: [
      'packages/**/*.test.ts',
      'tests/**/*.test.ts',
      'apps/admin/**/*.test.tsx',
    ],
  },
});
