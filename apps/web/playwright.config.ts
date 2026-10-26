import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const CI = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: CI,
  reporter: 'list',
  use: { baseURL: `http://localhost:${String(PORT)}` },
  // ponytail: Chromium only; add firefox/webkit projects when E7 checks browser support
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // serves the production build: run `pnpm build` first
    command: `pnpm start --port ${String(PORT)}`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: !CI,
  },
});
