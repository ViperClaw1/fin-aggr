import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
// the component stand exists only in development (spec §6 rule 7), so it gets its own dev server
const DEV_PORT = 3101;
const CI = process.env['CI'] !== undefined;
// Next 16 allows one `next dev` per app folder: with your own dev server running, point the
// component project at it (E2E_DEV_URL=http://localhost:3000) and no second one is started.
const selectedProjects = process.argv
  .filter((arg) => arg.startsWith('--project='))
  .map((arg) => arg.slice('--project='.length));
// Firefox and WebKit do not use the stand. Starting `next dev` beside a running one fails.
const wantsComponents =
  selectedProjects.length === 0 || selectedProjects.some((name) => name.startsWith('components'));
const EXTERNAL_DEV_URL = process.env['E2E_DEV_URL'];
const DEV_URL = EXTERNAL_DEV_URL ?? `http://localhost:${String(DEV_PORT)}`;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: CI,
  reporter: 'list',
  // Production routes run in Chromium on every pull request. Firefox and WebKit run on main
  // and nightly (E7 decision 5). The component stand stays Chromium: it exists only in dev.
  projects: [
    {
      name: 'chromium',
      testIgnore: 'components/**',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${String(PORT)}` },
    },
    {
      name: 'firefox',
      testIgnore: 'components/**',
      // One context: two Firefox contexts crash the browser (Playwright 1.64, FrameTree.js).
      // Axe on /compare/cd needs more than the 30s default.
      workers: 1,
      timeout: 60_000,
      expect: { timeout: 15_000 },
      use: { ...devices['Desktop Firefox'], baseURL: `http://localhost:${String(PORT)}` },
    },
    {
      name: 'webkit',
      testIgnore: 'components/**',
      workers: 1,
      timeout: 60_000,
      expect: { timeout: 15_000 },
      use: { ...devices['Desktop Safari'], baseURL: `http://localhost:${String(PORT)}` },
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
    ...(wantsComponents && EXTERNAL_DEV_URL === undefined
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
