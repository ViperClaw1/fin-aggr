import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // same alias as apps/web/tsconfig.json
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL('apps/web/src/', import.meta.url)) },
    ],
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/web/src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.canary.ts'],
      // AC-2: engine lines ≥ 90%, branches ≥ 85%
      thresholds: { 'packages/engine/src/**': { lines: 90, branches: 85 } },
    },
  },
});
