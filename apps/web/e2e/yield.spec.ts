// After-tax yield (E5 step 6). The numbers are whatever the engine returns for this seed.
import { compareRate, formatUsd, Profile } from '@fa/contracts';
import { rankProducts } from '@fa/engine';
import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './axe';

const fixtures = () => generateFixtures(Number(process.env.NEXT_PUBLIC_FA_SEED ?? DEFAULT_SEED));

function profile(stateCode: string) {
  const f = fixtures();
  return {
    tables: f.taxTables,
    products: f.products,
    value: Profile.parse({
      version: 1,
      taxYear: f.taxTables.taxYear,
      filingStatus: 'single',
      stateCode,
      taxableIncome: 8500000,
      cityMarginalRate: null,
      residency: 'us_citizen',
      age: 40,
      scenario: { principal: 1000000, holdingMonths: 12 },
    }),
  };
}

function bestNet(category: 'cd' | 'savings' | 'treasury', stateCode: string): string {
  const { tables, products, value } = profile(stateCode);
  const ranked = rankProducts(
    products.filter((item) => item.category === category),
    value,
    tables,
  );
  const top = ranked.find((row) => row.group === 'eligible' && row.netYield !== null);
  const interest = top?.netYield?.netInterest;
  if (interest === undefined) throw new Error(`no eligible ${category} in ${stateCode}`);
  return formatUsd(interest);
}

async function fill(page: Page, stateCode: string): Promise<void> {
  const drawer = page.getByRole('dialog', { name: 'Your profile' });
  await drawer.getByLabel('Filing status').selectOption('single');
  await drawer.getByLabel('State of residence').selectOption(stateCode);
  const income = drawer.getByLabel('Taxable income');
  await income.fill('85000');
  await income.blur();
  await drawer.getByLabel('Residency').selectOption('us_citizen');
  const age = drawer.getByLabel('Age');
  await age.fill('40');
  await age.blur();
  await page.keyboard.press('Escape');
}

test('without a profile the page asks for one and shows no cards', async ({ page }) => {
  await page.goto('/tools/after-tax-yield');
  await expect(page.getByText(/Add your profile to compare/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Best CD' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add your profile' }).click();
  await expect(page.getByRole('dialog', { name: 'Your profile' })).toBeVisible();
});

test('a profile shows three cards, and a new state moves the CD differently from the Treasury', async ({
  page,
}) => {
  const tables = fixtures().taxTables;
  const ny = tables.states['NY'];
  expect(ny).toBeDefined();
  if (ny === undefined) return;
  const other = Object.keys(tables.states).find((code) => {
    const rate = tables.states[code]?.assumedMarginalRate;
    return code !== 'NY' && rate !== undefined && compareRate(rate, ny.assumedMarginalRate) !== 0;
  });
  expect(other).toBeDefined();
  if (other === undefined) return;

  await page.goto('/tools/after-tax-yield?profile=filingStatus');
  await fill(page, 'NY');
  await expect(page.getByRole('region', { name: 'Best CD' })).toContainText(bestNet('cd', 'NY'));
  await expect(page.getByRole('region', { name: 'Best savings' })).toContainText(
    bestNet('savings', 'NY'),
  );
  await expect(page.getByRole('region', { name: 'Best Treasury' })).toContainText(
    bestNet('treasury', 'NY'),
  );

  await page.goto(`/tools/after-tax-yield?profile=stateCode`);
  const drawer = page.getByRole('dialog', { name: 'Your profile' });
  await drawer.getByLabel('State of residence').selectOption(other);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Best CD' })).toContainText(bestNet('cd', other));
  await expect(page.getByRole('region', { name: 'Best Treasury' })).toContainText(
    bestNet('treasury', other),
  );
  const cdMoved = bestNet('cd', 'NY') !== bestNet('cd', other);
  const treasuryMoved = bestNet('treasury', 'NY') !== bestNet('treasury', other);
  expect(cdMoved).not.toBe(treasuryMoved);
});

test('the yield page has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/tools/after-tax-yield');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);
});
