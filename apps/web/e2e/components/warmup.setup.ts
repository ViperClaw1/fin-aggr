// A cold dev server compiles the stand on first visit, which made the first spec time out at
// random. One visit before the component specs takes that cost once.
import { test as setup } from '@playwright/test';

setup('compile the component stand', async ({ page }) => {
  setup.setTimeout(180_000);
  await page.goto('/dev/components', { waitUntil: 'load', timeout: 180_000 });
});
