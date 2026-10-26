import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('home renders without serious or critical axe violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).analyze();
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(blocking).toEqual([]);
});
