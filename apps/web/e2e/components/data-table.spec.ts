import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from '../axe';

const MAIN = 'Savings accounts (synthetic)';
const table = (page: Page) => page.getByRole('table', { name: MAIN });
const header = (page: Page, name: RegExp) => table(page).getByRole('columnheader', { name });
/** Bank names in row order, without the expand toggle's glyph. */
const banks = async (page: Page) =>
  (await table(page).getByRole('rowheader').allInnerTexts()).map((t) => t.replace(/^[+−]/, ''));

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/components');
});

test('tables have no serious or critical axe violations', async ({ page }) => {
  await table(page).getByRole('button', { name: 'Show details' }).first().click();
  await expectNoA11yViolations(page, 'section[aria-labelledby="table"]');
});

test('the keyboard cycles sorting and aria-sort follows', async ({ page }) => {
  const apy = header(page, /APY/);
  await expect(apy).toHaveAttribute('aria-sort', 'none');
  await apy.getByRole('button').focus();
  await page.keyboard.press('Enter');
  await expect(apy).toHaveAttribute('aria-sort', 'ascending');
  await page.keyboard.press('Space');
  await expect(apy).toHaveAttribute('aria-sort', 'descending');
  await page.keyboard.press('Enter');
  await expect(apy).toHaveAttribute('aria-sort', 'none');
});

test('money sorts by value, not as text; ties keep a fixed order', async ({ page }) => {
  await header(page, /Minimum deposit/)
    .getByRole('button')
    .click();
  // $9 < $10,000 (two banks, ordered by id) < $2,500,000
  expect(await banks(page)).toEqual([
    'Alder Savings',
    'Birch Bank',
    'Dogwood Direct',
    'Cedar Credit',
  ]);
});

test('rates sort by value: 10% above 9%, 4.5% equal to 4.50%', async ({ page }) => {
  const button = header(page, /APY/).getByRole('button');
  await button.click();
  await button.click();
  expect(await banks(page)).toEqual([
    'Cedar Credit',
    'Dogwood Direct',
    'Alder Savings',
    'Birch Bank',
  ]);
});

test('hiding the sorted column removes it and resets sorting', async ({ page }) => {
  await header(page, /APY/).getByRole('button').click();
  await page.getByLabel('Hide APY column').check();
  await expect(header(page, /APY/)).toHaveCount(0);
  await expect(table(page).getByRole('cell', { name: '4.5%' })).toHaveCount(0);
  expect(await banks(page)).toEqual([
    'Alder Savings',
    'Birch Bank',
    'Cedar Credit',
    'Dogwood Direct',
  ]);
  await expect(header(page, /Minimum deposit/)).toHaveAttribute('aria-sort', 'none');
});

test('a row expands from the keyboard into a full-width row', async ({ page }) => {
  const toggle = table(page).getByRole('button', { name: 'Show details' }).first();
  await toggle.focus();
  await page.keyboard.press('Enter');
  const open = table(page).getByRole('button', { name: 'Hide details' });
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  const detailsId = await open.getAttribute('aria-controls');
  const details = page.locator(`[id="${detailsId ?? ''}"] td`);
  await expect(details).toHaveText('Details for Alder Savings');
  await expect(details).toHaveAttribute('colspan', '4');
  await page.getByLabel('Hide APY column').check();
  await expect(details).toHaveAttribute('colspan', '3');
  await open.press('Space');
  await expect(details).toHaveCount(0);
});

test('loading, empty and error states replace the body', async ({ page }) => {
  await expect(page.getByRole('table', { name: 'Loading table' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await expect(page.getByText('No accounts match these filters')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Empty table' }).getByRole('rowheader')).toHaveCount(
    0,
  );
  await expect(
    page
      .getByRole('region', { name: 'DataTable' })
      .getByRole('alert')
      .filter({ hasText: 'Could not load data' }),
  ).toBeVisible();
});

test.describe('on a 375 px screen', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('only the table region scrolls sideways and it is reachable by Tab', async ({ page }) => {
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(pageOverflow).toBe(0);
    const region = page.getByRole('region', { name: MAIN });
    expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await page.getByLabel('Hide APY column').focus();
    await page.keyboard.press('Tab');
    await expect(region).toBeFocused();
  });
});
