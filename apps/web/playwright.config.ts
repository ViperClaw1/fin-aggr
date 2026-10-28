import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
// the component stand exists only in development (spec §6 rule 7), so it gets its own dev server
const DEV_PORT = 3101;
const CI = process.env['CI'] !== undefined;
// Next 16 allows one `next dev` per app folder: with your own dev server running, point the
// component project at it (E2E_DEV_URL=http://localhost:3000) and no second one is started.
const EXTERNAL_DEV_URL = process.env['E2E_DEV_URL'];
const DEV_URL = EXTERNAL_DEV_URL ?? `http://localhost:${String(DEV_PORT)}`;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: CI,
  reporter: 'list',
  // ponytail: Chromium only; add firefox/webkit projects when E7 checks browser support
  projects: [
    {
      name: 'chromium',
      testIgnore: 'components/**',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${String(PORT)}` },
    },
    {
      name: 'components-warmup',
      testDir: './e2e/components',
      testMatch: 'warmup.setup.ts',
      use: { baseURL: DEV_URL },
    },
    {
      name: 'components',
      testDir: './e2e/components',
      // a cold dev server compiles on first visit: the warm-up project visits the stand once first.
      // In CI also run after the production project, one worker, so it never competes for CPU with it.
      dependencies: CI ? ['components-warmup', 'chromium'] : ['components-warmup'],
      ...(CI ? { workers: 1 } : {}),
      use: {
        ...devices['Desktop Chrome'],
        baseURL: DEV_URL,
        navigationTimeout: 60_000,
      },
    },
  ],
  webServer: [
    {
      // serves the production build: run `pnpm build` first
      command: `pnpm start --port ${String(PORT)}`,
      url: `http://localhost:${String(PORT)}`,
      reuseExistingServer: !CI,
    },
    ...(EXTERNAL_DEV_URL === undefined
      ? [
          {
            // dev output goes to .next/dev, so it does not touch the production build
            command: `pnpm dev --port ${String(DEV_PORT)}`,
            url: `${DEV_URL}/dev/components`,
            reuseExistingServer: !CI,
            timeout: 180_000,
          },
        ]
      : []),
  ],
});
