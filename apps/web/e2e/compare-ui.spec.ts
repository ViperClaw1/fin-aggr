// Compare page UI details: the category tabs and the APY cell. The flows live in compare.spec.ts.
import { expect, test, type Page } from '@playwright/test';

const table = (page: Page) => page.getByRole('table', { name: 'Certificates of deposit' });

// the category tabs scroll sideways only: no phantom vertical scrollbar beside them
for (const width of [360, 768, 1280]) {
  test(`at ${String(width)}px the category tabs do not scroll vertically`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/compare/cd');
    const nav = page.getByRole('navigation', { name: 'Product category' });
    const box = await nav.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(box.scroll).toBe(box.client);
  });
}

// T3: the APY cell holds the rate; its source, status and demo mark open on demand
test('the APY cell shows the rate; the keyboard opens its source and Escape closes it', async ({
  page,
}) => {
  await page.goto('/compare/cd');
  await expect(page.getByLabel('Search bank or product')).toBeEnabled();
  const cell = table(page).locator('tbody tr').first().locator('[data-citation]');
  await expect(cell.getByText('Demo data')).toBeHidden();
  const toggle = cell.locator('summary');
  await expect(toggle).toHaveText(/^\d+\.\d{2,}%, (Unverified|Verified .+), show source$/);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(cell.getByText('Demo data')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cell.getByText('Demo data')).toBeHidden();
  await expect(toggle).toBeFocused();
});
