// ADR-016 D1: the catalog is in the static HTML and the client does not load the gateway.
import { expect, test, type Page } from '@playwright/test';
import { Profile } from '@fa/contracts';
import { rankProducts } from '@fa/engine';
import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { expectNoA11yViolations } from './axe';

// a string that exists only in the fixtures package, so only the mock gateway chunk carries it
const FIXTURE_MARKER = 'mock-call-reports';

test('the CD table is rendered in the static HTML, freshness included', async ({ request }) => {
  const html = await (await request.get('/compare/cd')).text();
  // a rendered row, not only the serialized props (which also carry the names)
  expect(html).toMatch(/<caption[^>]*>Certificates of deposit<\/caption>/);
  expect(html).toMatch(/<td[^>]*>12-Month CD<\/td>/);
  expect(html).toMatch(/\d+ days? ago|today/i);
});

test('after hydration no script with the mock gateway or fixtures is loaded', async ({ page }) => {
  const scripts: Promise<string>[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') scripts.push(response.text());
  });
  await page.goto('/compare/cd');
  await expect(page.getByRole('table', { name: 'Certificates of deposit' })).toBeVisible();
  // freshness text appears once datasetInfo is read from the hydrated cache
  await expect(page.getByText(/days? ago|today/i).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  const bodies = await Promise.all(scripts);
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.filter((b) => b.includes(FIXTURE_MARKER))).toHaveLength(0);
});

test('lists all 60 CDs, best APY first, with sources', async ({ page }) => {
  await page.goto('/compare/cd');
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(61); // header + 60
  await expect(rows.nth(1).locator('[data-citation]').first()).toBeVisible();
});

test('a filter in the URL narrows the table in memory', async ({ page }) => {
  await page.goto('/compare/cd?term=12');
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows.nth(1)).toContainText('12-Month CD');
  expect(await rows.count()).toBeLessThan(61);
});

test('compare renders without serious or critical axe violations', async ({ page }) => {
  await page.goto('/compare/cd');
  await expect(page.getByRole('table')).toBeVisible();
  await expectNoA11yViolations(page);
});

// With partial prerendering the shell is already streamed, so the status stays 200; Next renders
// the not-found page and marks it noindex instead.
test('an unknown category renders not found, noindex', async ({ page }) => {
  await page.goto('/compare/mortgage');
  await expect(page.getByText(/could not be found/i)).toBeVisible();
  // Next may stream the robots tag twice; at least one is enough
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  await expect(page.getByRole('table')).toHaveCount(0);
});

// E5 step 2: default order, column sort in the URL, after-tax ranking with a profile
const table = (page: Page) => page.getByRole('table', { name: 'Certificates of deposit' });
const BY_APY = 'Sorted by top APY. Add your profile for after-tax ranking.';
const RANKED = 'Ranked for your profile: eligible first, then by net interest after tax.';

test('without a profile the order is top APY, said in words', async ({ page }) => {
  await page.goto('/compare/cd');
  await expect(page.getByText(BY_APY)).toBeVisible();
  await expect(table(page).getByRole('columnheader', { name: /Net interest/ })).toHaveCount(0);
});

test('three clicks on a header return to the default order', async ({ page }) => {
  await page.goto('/compare/cd');
  const header = table(page).getByRole('button', { name: /Top APY/ });
  await header.click();
  await expect(page).toHaveURL(/sort=apy\.asc/);
  await expect(page.getByText(BY_APY)).toHaveCount(0);
  await header.click();
  await expect(page).toHaveURL(/sort=apy\.desc/);
  await header.click();
  await expect(page).not.toHaveURL(/sort=/);
  await expect(page.getByText(BY_APY)).toBeVisible();
});

test('a sort on a net column without a profile falls back, the URL is kept', async ({ page }) => {
  await page.goto('/compare/cd?sort=netYield.desc');
  await expect(page.getByText(BY_APY)).toBeVisible();
  await expect(page).toHaveURL(/sort=netYield\.desc/);
});

test('with a profile the table ranks after tax, net values marked as assumptions', async ({
  page,
}) => {
  await page.goto('/compare/cd?profile=filingStatus');
  const drawer = page.getByRole('dialog', { name: 'Your profile' });
  await drawer.getByLabel('Filing status').selectOption('single');
  await drawer.getByLabel('State of residence').selectOption('NY');
  const income = drawer.getByLabel('Taxable income');
  await income.fill('85000');
  await income.blur();
  await drawer.getByLabel('Residency').selectOption('us_citizen');
  // with age known no product needs more data: only eligible and ineligible groups
  const age = drawer.getByLabel('Age');
  await age.fill('40');
  await age.blur();
  await page.keyboard.press('Escape');

  await expect(page.getByText(RANKED)).toBeVisible();
  await expect(table(page).locator('td [data-assumption]').first()).toBeVisible();

  // the same order as the engine on the same data: fixtures from the seed the build used
  const f = generateFixtures(Number(process.env.NEXT_PUBLIC_FA_SEED ?? DEFAULT_SEED));
  const cds = f.products.filter((p) => p.category === 'cd');
  const bank = new Map(f.institutions.map((i) => [i.id, i.name]));
  const byId = new Map(cds.map((p) => [p.id, p]));
  const profile = Profile.parse({
    version: 1,
    taxYear: f.taxTables.taxYear,
    filingStatus: 'single',
    stateCode: 'NY',
    taxableIncome: 8500000,
    cityMarginalRate: null,
    residency: 'us_citizen',
    age: 40,
    scenario: { principal: 1000000, holdingMonths: 12 }, // the form's defaults, left empty
  });
  const expected = rankProducts(cds, profile, f.taxTables).map((r) => {
    const p = byId.get(r.productId);
    return `${bank.get(p?.institutionId ?? '') ?? ''}|${p?.name ?? ''}`;
  });
  const shown = await table(page)
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows.map((r) =>
        [...r.querySelectorAll<HTMLElement>('th, td')]
          .slice(0, 2)
          .map((c) => c.innerText)
          .join('|'),
      ),
    );
  expect(shown).toEqual(expected);
});

test('the filter form writes the URL, Reset clears it', async ({ page }) => {
  await page.goto('/compare/cd');
  const form = page.getByRole('form', { name: 'Filters' });
  await form.getByRole('group', { name: 'Term' }).getByLabel('12 mo').check();
  await expect(page).toHaveURL(/term=12/);
  const terms = await table(page).locator('tbody tr td:nth-child(3)').allInnerTexts();
  expect(new Set(terms)).toEqual(new Set(['12 mo']));

  await form.getByLabel('Search bank or product').fill('Granite');
  await expect(page).toHaveURL(/search=Granite/);
  await form.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page).not.toHaveURL(/term=|search=/);
  await expect(table(page).locator('tbody tr')).toHaveCount(60);
});

test('compare with the filter form has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/compare/cd');
  await expect(page.getByRole('form', { name: 'Filters' })).toBeVisible();
  await expectNoA11yViolations(page);
});
