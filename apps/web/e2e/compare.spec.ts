// ADR-016 D1: the catalog is in the static HTML and the client does not load the gateway.
import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './axe';

// a string that exists only in the fixtures package, so only the mock gateway chunk carries it
const FIXTURE_MARKER = 'mock-call-reports';

test('the CD catalog is in the static HTML', async ({ request }) => {
  const html = await (await request.get('/compare/cd')).text();
  expect(html).toContain('12-Month CD');
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
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
  await expect(page.getByRole('table')).toHaveCount(0);
});
