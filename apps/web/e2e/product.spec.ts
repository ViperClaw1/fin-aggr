// Product page (E5 step 3). Expected money comes from the engine on the same fixtures, not from
// constants copied off the screen.
import { formatUsd, Profile } from '@fa/contracts';
import { computeNetYield } from '@fa/engine';
import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './axe';

const fixtures = () => generateFixtures(Number(process.env.NEXT_PUBLIC_FA_SEED ?? DEFAULT_SEED));

async function fillProfile(page: Page): Promise<void> {
  const drawer = page.getByRole('dialog', { name: 'Your profile' });
  await drawer.getByLabel('Filing status').selectOption('single');
  await drawer.getByLabel('State of residence').selectOption('NY');
  const income = drawer.getByLabel('Taxable income');
  await income.fill('85000');
  await income.blur();
  await drawer.getByLabel('Residency').selectOption('us_citizen');
  await page.keyboard.press('Escape');
}

test('the product page shows sourced terms and default assumptions without a profile', async ({
  page,
}) => {
  const product = fixtures().products.find((item) => item.category === 'cd');
  expect(product).toBeDefined();
  await page.goto(`/product/${product?.id ?? ''}`);
  await expect(page.getByRole('heading', { level: 1, name: product?.name ?? '' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Rate tiers' })).toBeVisible();
  await expect(page.locator('[data-citation]').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'How this is calculated' })).toContainText(
    'Scenario: $10,000.00 for 12 months',
  );
  await expect(page.locator('article [data-sponsored]')).toHaveCount(0);
  await expect(page.locator('[data-sponsored="product_aside"]')).toBeVisible();
});

test('an unknown product renders not found, noindex', async ({ page }) => {
  await page.goto('/product/no-such-product');
  await expect(page.getByText(/could not be found/i)).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
});

test('Edit on the scenario opens the deposit field and the result follows it', async ({ page }) => {
  const f = fixtures();
  const product = f.products.find((item) => item.category === 'cd');
  expect(product).toBeDefined();
  if (product === undefined) return;
  await page.goto(`/product/${product.id}?profile=principal`);
  await fillProfile(page);
  const net = page.getByRole('group', { name: 'Net interest' });
  await expect(net).toBeVisible();
  const before = await net.innerText();

  await page.getByRole('button', { name: /Edit assumption: Scenario/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Your profile' });
  await expect(drawer.getByLabel('Amount to deposit')).toBeFocused();
  const amount = drawer.getByLabel('Amount to deposit');
  await amount.fill('20000');
  await amount.blur();
  await page.keyboard.press('Escape');
  await expect(net).not.toHaveText(before);

  const profile = Profile.parse({
    version: 1,
    taxYear: f.taxTables.taxYear,
    filingStatus: 'single',
    stateCode: 'NY',
    taxableIncome: 8500000,
    cityMarginalRate: null,
    residency: 'us_citizen',
    age: null,
    scenario: { principal: 2000000, holdingMonths: 12 },
  });
  const result = computeNetYield({
    product: { ...product, earlyWithdrawal: product.earlyWithdrawal.value },
    principal: profile.scenario.principal,
    holdingMonths: profile.scenario.holdingMonths,
    profile,
    tables: f.taxTables,
  });
  await expect(net).toContainText(formatUsd(result.netInterest));
});

test('a citation writes doc, page and q into the URL', async ({ page }) => {
  const product = fixtures().products.find(
    (item) => item.earlyWithdrawal.provenance.document !== undefined,
  );
  expect(product).toBeDefined();
  await page.goto(`/product/${product?.id ?? ''}`);
  const source = page.getByRole('button', { name: /, p\. \d+/ }).first();
  await expect(source).toBeVisible();
  await source.click();
  await expect(page).toHaveURL(/[?&]doc=/);
  await expect(page).toHaveURL(/[?&]page=/);
  await expect(page).toHaveURL(/[?&]q=/);
});

test('the compare table and an expanded row link to the product', async ({ page }) => {
  await page.goto('/compare/cd');
  const link = page.locator('table a[href^="/product/"]').first();
  await expect(link).toBeVisible();
  await page
    .getByRole('button', { name: /^Show details: / })
    .first()
    .click();
  await expect(page.getByRole('link', { name: 'Full breakdown' })).toHaveAttribute(
    'href',
    /^\/product\//,
  );
});

test('the product page has no serious or critical axe violations', async ({ page }) => {
  const product = fixtures().products.find((item) => item.category === 'cd');
  await page.goto(`/product/${product?.id ?? ''}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);
});
