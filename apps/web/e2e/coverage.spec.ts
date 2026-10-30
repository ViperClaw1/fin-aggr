import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './axe';

const fixtures = () => generateFixtures(Number(process.env.NEXT_PUBLIC_FA_SEED ?? DEFAULT_SEED));

test('an amount over the limit is split across banks', async ({ page }) => {
  const f = fixtures();
  const bank = f.institutions.find((item) => item.kind === 'direct_bank');
  expect(bank).toBeDefined();
  const limitCents = f.insuranceRules.byRegulator.FDIC.limitPerOwnerPerInstitutionPerCategory;
  const dollars = String(Math.floor(limitCents / 100) + 10_000);

  await page.goto('/tools/fdic-coverage');
  await page.getByRole('button', { name: 'Add an account' }).click();
  await page.getByLabel('Bank').selectOption({ label: bank?.name ?? '' });
  const amount = page.getByLabel('Amount');
  await amount.fill(dollars);
  await amount.blur();

  await expect(page.getByRole('group', { name: /, single$/ }).nth(1)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Insured', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Not insured', exact: true })).toBeVisible();
  await expect(page.locator('[data-assumption]').first()).toBeVisible();
});

test('a fintech account is excluded and the reason is shown', async ({ page }) => {
  const fintech = fixtures().institutions.find((item) => item.kind === 'fintech_partner');
  expect(fintech).toBeDefined();
  await page.goto('/tools/fdic-coverage');
  await page.getByRole('button', { name: 'Add an account' }).click();
  await page.getByLabel('Bank').selectOption({ label: fintech?.name ?? '' });
  const amount = page.getByLabel('Amount');
  await amount.fill('1000');
  await amount.blur();
  await expect(page.getByText(/fintech partner/i)).toBeVisible();
});

test('the limit is marked unverified', async ({ page }) => {
  await page.goto('/tools/fdic-coverage');
  await expect(page.getByText('Unverified').first()).toBeVisible();
  await expect(page.locator('[data-assumption]')).toHaveCount(0);
});

test('an account row can be added and removed from the keyboard', async ({ page }) => {
  await page.goto('/tools/fdic-coverage');
  const add = page.getByRole('button', { name: 'Add an account' });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Bank')).toBeFocused();
  await page.getByRole('button', { name: 'Remove account 1' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Bank')).toHaveCount(0);
  await expect(add).toBeFocused();
});

test('the coverage page has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/tools/fdic-coverage');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);
});
