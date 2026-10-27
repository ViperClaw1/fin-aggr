import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './axe';

test('home renders without serious or critical axe violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);
});

test('every page shows the demo data banner (AC-5)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('complementary', { name: 'Demo data notice' })).toContainText(
    'DEMO DATA',
  );
});

test('the component stand is absent from the production build', async ({ request }) => {
  const response = await request.get('/dev/components');
  expect(response.status()).toBe(404);
});
