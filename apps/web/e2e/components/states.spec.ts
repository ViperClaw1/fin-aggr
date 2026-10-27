import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from '../axe';

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/components');
});

test('states and the banner have no serious or critical axe violations', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'States' })).toBeVisible();
  await expectNoA11yViolations(page);
});

test('the skeleton announces what is loading', async ({ page }) => {
  await expect(page.getByRole('status').filter({ hasText: 'Loading products' })).toBeAttached();
});

test('a retryable error offers a retry that works from the keyboard', async ({ page }) => {
  const block = page.getByTestId('error-retryable');
  await expect(block.getByRole('alert')).toBeVisible();
  await block.getByRole('button', { name: 'Try again' }).focus();
  await page.keyboard.press('Enter');
  await expect(block).toContainText('Retries: 1');
});

test('a final error has no retry button', async ({ page }) => {
  const block = page.getByTestId('error-final');
  await expect(block.getByRole('alert')).toBeVisible();
  await expect(block.getByRole('button')).toHaveCount(0);
});
