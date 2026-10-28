import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
// the component stand exists only in development (spec §6 rule 7), so it gets its own dev server
const DEV_PORT = 3101;
const CI = process.env['CI'] !== undefined;

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
      name: 'components',
      testDir: './e2e/components',
      // a cold dev server compiles on first visit; in CI keep it off the parallel path
      ...(CI ? { workers: 1 } : {}),
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${String(DEV_PORT)}`,
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
    {
      // dev output goes to .next/dev, so it does not touch the production build
      command: `pnpm dev --port ${String(DEV_PORT)}`,
      url: `http://localhost:${String(DEV_PORT)}/dev/components`,
      reuseExistingServer: !CI,
      timeout: 180_000,
    },
  ],
});
