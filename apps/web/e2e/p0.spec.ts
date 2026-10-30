// Closing checks for the P0 routes (E5 step 8): citations, the profile sentinel, ads, keyboard.
import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { expect, test, type Page } from '@playwright/test';

const fixtures = generateFixtures(Number(process.env.NEXT_PUBLIC_FA_SEED ?? DEFAULT_SEED));
const product = fixtures.products.find((item) => item.category === 'cd');
const bank = fixtures.institutions.find((item) => item.kind === 'direct_bank');

const DATA_ROUTES = [
  '/compare/cd',
  '/compare/savings',
  '/compare/treasury',
  `/product/${product?.id ?? ''}`,
  '/banks',
  `/banks/${bank?.id.replaceAll(':', '_') ?? ''}`,
  '/tools/fdic-coverage',
];

const profileButton = (page: Page) => page.locator('header button[aria-haspopup="dialog"]');

test('significant numbers on the data pages carry a citation or an assumption', async ({
  page,
}) => {
  for (const path of DATA_ROUTES) {
    await page.goto(path);
    await expect(page.locator('[data-citation], [data-assumption]').first()).toBeVisible();
  }
});

test('sponsored offers sit outside tables, lists and the product article', async ({ page }) => {
  const inside =
    'table [data-sponsored], ul [data-sponsored], ol [data-sponsored], article [data-sponsored]';
  for (const path of ['/compare/cd', `/product/${product?.id ?? ''}`, '/']) {
    await page.goto(path);
    await expect(page.locator(inside)).toHaveCount(0);
  }
  await page.goto('/compare/cd');
  await expect(page.locator('[data-sponsored="compare_top"]')).toBeVisible();
  await page.goto(`/product/${product?.id ?? ''}`);
  await expect(page.locator('[data-sponsored="product_aside"]')).toBeVisible();
});

test('the compare table and the profile drawer work from the keyboard', async ({ page }) => {
  await page.goto('/compare/cd');
  // header buttons are in the static HTML and stay disabled until the filter form is live
  await expect(page.getByLabel('Search bank or product')).toBeEnabled();
  const apy = page.getByRole('button', { name: 'Top APY' });
  await expect(apy).toBeEnabled();
  await apy.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/[?&]sort=apy\.asc/);
  await expect(apy).toBeFocused();

  await page.goto('/');
  await profileButton(page).focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Your profile' });
  await expect(drawer.getByLabel('Filing status')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(profileButton(page)).toBeFocused();
});

test('a sentinel income never leaves the browser while following links (AC-4)', async ({
  page,
}) => {
  const sentinel = /987,?654/;
  const leaks: string[] = [];
  page.on('request', (request) => {
    const parts = [request.url(), JSON.stringify(request.headers()), request.postData() ?? ''];
    if (parts.some((part) => sentinel.test(part))) leaks.push(request.url());
  });

  await page.goto('/');
  await profileButton(page).click();
  const drawer = page.getByRole('dialog', { name: 'Your profile' });
  await drawer.getByLabel('State of residence').selectOption('NY');
  const income = drawer.getByLabel('Taxable income');
  await income.fill('987654');
  await income.blur();
  await page.keyboard.press('Escape');

  const main = page.getByRole('main');
  await main.getByRole('link', { name: 'Compare CDs' }).click();
  await expect(page).toHaveURL(/\/compare\/cd$/);
  await page.locator('table a[href^="/product/"]').first().click();
  await expect(page).toHaveURL(/\/product\//);
  await page.locator('a[href^="/banks/"]').first().click();
  await expect(page).toHaveURL(/\/banks\//);
  await page.getByRole('link', { name: 'FA home' }).click();
  await main.getByRole('link', { name: 'Plan coverage' }).click();
  await expect(page).toHaveURL(/\/tools\/fdic-coverage$/);
  await page.getByRole('link', { name: 'FA home' }).click();
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByText('Tools', { exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'After-tax yield' })
    .click();
  await expect(page).toHaveURL(/\/tools\/after-tax-yield$/);
  const footer = page.getByRole('contentinfo');
  await footer.getByRole('link', { name: 'Methodology' }).click();
  await footer.getByRole('link', { name: 'Advertiser disclosure' }).click();
  await footer.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.waitForLoadState('networkidle');
  expect(leaks).toEqual([]);
});

test('the Compare menu closes after a choice and after a click outside', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const compare = nav.getByText('Compare', { exact: true });
  const menu = nav.locator('details').filter({ hasText: 'Compare' });
  await page.goto('/');
  await compare.click();
  await expect(menu).toHaveJSProperty('open', true);
  await page.getByRole('heading', { level: 1 }).click();
  await expect(menu).toHaveJSProperty('open', false);

  await compare.click();
  await nav.getByRole('link', { name: 'CDs', exact: true }).click();
  await expect(page).toHaveURL(/\/compare\/cd$/);
  await expect(menu).toHaveJSProperty('open', false);
});
