import { METRIC_KEYS } from '@fa/contracts';
import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './axe';

const fixtures = () => generateFixtures(Number(process.env.NEXT_PUBLIC_FA_SEED ?? DEFAULT_SEED));
const bankPath = (id: string): string => `/banks/${id.replaceAll(':', '_')}`;

const METRIC_LABEL: Record<(typeof METRIC_KEYS)[number], string> = {
  tier1LeverageRatio: 'Tier 1 leverage',
  totalRiskBasedCapitalRatio: 'Total risk-based capital',
  allowanceToLoans: 'Allowance to loans',
  loansToDeposits: 'Loans to deposits',
  liquidAssetsToAssets: 'Liquid assets to assets',
  noncurrentLoansRatio: 'Noncurrent loans',
  returnOnAssets: 'Return on assets',
};

test('search and the kind filter narrow the list, and a row opens the bank', async ({ page }) => {
  const f = fixtures();
  const creditUnion = f.institutions.find((item) => item.kind === 'credit_union');
  const bank = f.institutions.find((item) => item.kind === 'direct_bank');
  expect(creditUnion).toBeDefined();
  expect(bank).toBeDefined();
  if (creditUnion === undefined || bank === undefined) return;

  await page.goto('/banks');
  await page.getByLabel('Search by name').fill(creditUnion.name);
  await expect(page).toHaveURL(/bank=/);
  await expect(page.getByRole('link', { name: creditUnion.name })).toBeVisible();
  await expect(page.getByRole('link', { name: bank.name })).toHaveCount(0);

  await page.goto('/banks?bankKind=credit_union');
  await expect(page.getByRole('link', { name: creditUnion.name })).toBeVisible();
  await expect(page.getByRole('link', { name: bank.name })).toHaveCount(0);

  await page.getByRole('link', { name: creditUnion.name }).click();
  await expect(page.getByRole('heading', { level: 1, name: creditUnion.name })).toBeVisible();
});

test('a missing metric is n/a and a present one is cited', async ({ page }) => {
  const f = fixtures();
  const gap = f.bankMetrics.find((metrics) =>
    METRIC_KEYS.some((key) => metrics.metrics[key] === undefined),
  );
  expect(gap).toBeDefined();
  if (gap === undefined) return;
  const key = METRIC_KEYS.find((item) => gap.metrics[item] === undefined);
  expect(key).toBeDefined();
  if (key === undefined) return;
  await page.goto(bankPath(gap.institutionId));
  await expect(page.locator('li', { hasText: METRIC_LABEL[key] })).toContainText('n/a');
  await expect(page.locator('[data-citation]').first()).toBeVisible();
});

test('an unknown bank renders not found, noindex', async ({ page }) => {
  await page.goto('/banks/no-such-bank');
  await expect(page.getByText(/could not be found/i)).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
});

test('the bank list and a bank page have no serious or critical axe violations', async ({
  page,
}) => {
  await page.goto('/banks');
  await expect(page.getByRole('heading', { level: 1, name: 'Banks' })).toBeVisible();
  await expectNoA11yViolations(page);
  const bank = fixtures().institutions.find((item) => item.kind === 'direct_bank');
  await page.goto(bankPath(bank?.id ?? ''));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);
});
