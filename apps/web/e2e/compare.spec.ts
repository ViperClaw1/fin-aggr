// ADR-016 D1: the catalog is in the static HTML and the client does not load the gateway.
import { expect, test, type Page } from '@playwright/test';
import { Profile } from '@fa/contracts';
import { rankProducts } from '@fa/engine';
import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { expectNoA11yViolations } from './axe';
import { fillSingleNy } from './compare-profile';

// a string that exists only in the fixtures package, so only the mock gateway chunk carries it
const FIXTURE_MARKER = 'mock-call-reports';

test('the CD table is rendered in the static HTML', async ({ request }) => {
  const html = await (await request.get('/compare/cd')).text();
  // a rendered row, not only the serialized props (which also carry the names)
  expect(html).toMatch(/<caption[^>]*>Certificates of deposit<\/caption>/);
  expect(html).toMatch(/<a [^>]*>12-Month CD<\/a>/);
});

test('after hydration no script with the mock gateway or fixtures is loaded', async ({ page }) => {
  const scripts: Promise<string>[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') scripts.push(response.text());
  });
  await page.goto('/compare/cd');
  await expect(page.getByRole('table', { name: 'Certificates of deposit' })).toBeVisible();
  // data-ready is set in an effect, after hydration. The source panel mounts only while open,
  // so freshness is not in the closed cell.
  const source = page
    .getByRole('table', { name: 'Certificates of deposit' })
    .locator('details[data-ready]')
    .first();
  await source.waitFor();
  await source.locator('summary').click();
  await expect(source.getByText(/Updated (today|yesterday|\d+ days ago)/)).toBeVisible();
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

test('a filter in the URL hides rows and keeps them mounted', async ({ page }) => {
  await page.goto('/compare/cd?term=12');
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows.nth(1)).toContainText('12-Month CD');
  expect(await rows.count()).toBeLessThan(61);
});

test('compare renders without serious or critical axe violations', async ({ page }) => {
  test.setTimeout(60_000);
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

test('without a profile the order is top APY, said in words', async ({ page }) => {
  await page.goto('/compare/cd');
  await expect(page.getByText(BY_APY)).toBeVisible();
  await expect(table(page).getByRole('columnheader', { name: 'Net interest' })).toBeVisible();
  await expect(table(page).getByRole('columnheader', { name: 'Fit' })).toBeVisible();
  await expect(table(page).getByRole('button', { name: 'Add profile' }).first()).toBeVisible();
});

test('three clicks on a header return to the default order', async ({ page }) => {
  await page.goto('/compare/cd');
  // the header buttons are in the static HTML before they work: wait for hydration
  await expect(page.getByLabel('Search bank or product')).toBeEnabled();
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
  // with age known no product needs more data: only eligible and ineligible groups
  await fillSingleNy(page, '40');
  await expect(table(page).locator('td [data-assumption]').first()).toBeVisible();

  // the ranked banner is already up before age is filled: the profile is complete without it.
  // age reaches the table through useDeferredValue, so the row order can lag that banner.
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
  const shown = () =>
    table(page)
      .locator('tbody tr')
      .evaluateAll((rows) =>
        rows.map((row) => {
          const head = row.querySelector('th');
          if (head === null) return '';
          const copy = head.cloneNode(true) as HTMLElement;
          copy.querySelectorAll('button, [data-secondary]').forEach((node) => {
            node.remove();
          });
          const bankNode = copy.querySelector('[data-bank]');
          const productNode = copy.querySelector('a');
          const bank = bankNode === null ? '' : bankNode.textContent.trim();
          const product = productNode === null ? '' : productNode.textContent.trim();
          return `${bank}|${product}`;
        }),
      );
  await expect.poll(shown).toEqual(expected);
});

test('the filter form writes the URL, Reset clears it', async ({ page }) => {
  await page.goto('/compare/cd');
  const form = page.getByRole('form', { name: 'Filters' });
  await form.getByRole('spinbutton', { name: 'Minimum term' }).fill('12');
  await form.getByRole('spinbutton', { name: 'Maximum term' }).fill('12');
  await expect(page).toHaveURL(/term=12/);
  const terms = await table(page).locator('tbody tr:visible td:nth-child(2)').allInnerTexts();
  expect(new Set(terms)).toEqual(new Set(['12 mo']));

  await form.getByLabel('Search bank or product').fill('Granite');
  await expect(page).toHaveURL(/search=Granite/);
  await form.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page).not.toHaveURL(/term=|search=/);
  await expect(table(page).locator('tbody tr:visible')).toHaveCount(60);
});

test('compare with the filter form has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/compare/cd');
  await expect(page.getByRole('form', { name: 'Filters' })).toBeVisible();
  await expectNoA11yViolations(page);
});

// AC-8 / CLS: the prerendered page holds the disabled form, so hydration does not move the table
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`the table does not move on hydration at ${String(viewport.width)}px`, async ({
    browser,
    browserName,
  }) => {
    // Firefox dies opening a second context with JavaScript off (Playwright 1.64, FrameTree.js).
    test.fixme(
      browserName === 'firefox',
      'Firefox crashes when a second context disables JavaScript',
    );
    const top = async (javaScriptEnabled: boolean) => {
      const context = await browser.newContext({ viewport, javaScriptEnabled });
      const page = await context.newPage();
      await page.goto('/compare/cd');
      if (javaScriptEnabled) {
        const ready =
          viewport.width >= 1024
            ? page.getByLabel('Search bank or product')
            : page.getByRole('button', { name: /^Filters/ });
        await expect(ready).toBeEnabled();
      }
      const box = await page.locator('[data-results]').boundingBox();
      await context.close();
      return box?.y;
    };
    const before = await top(false);
    expect(before).toBeDefined();
    expect(await top(true)).toBe(before);
  });
}

test('an expanded row shows the institution; with a profile, the math and its assumptions', async ({
  page,
}) => {
  await page.goto('/compare/cd');
  // the button is in the static HTML before it works: wait for hydration
  await expect(page.getByLabel('Search bank or product')).toBeEnabled();
  const first = table(page)
    .getByRole('button', { name: /^Show details: / })
    .first();
  // the name changes to "Hide details" once open: hold the button by what it controls
  const controls = (await first.getAttribute('aria-controls')) ?? '';
  await first.click();
  await expect(table(page).locator(`[aria-controls="${controls}"]`)).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(table(page).getByText('Add your profile to see the after-tax math.')).toBeVisible();

  await page.goto('/compare/cd?profile=filingStatus');
  await fillSingleNy(page);

  await table(page)
    .getByRole('button', { name: /^Show details: / })
    .first()
    .click();
  await table(page).getByText('How this is calculated').click();
  const math = table(page).getByRole('region', { name: 'How this is calculated' });
  await expect(math).toBeVisible();
  await expect(math).toHaveAttribute('data-assumption', '');
  await table(page)
    .getByText(/^Assumptions/)
    .click();
  await expect(table(page).getByText('Tax year 2026.')).toBeVisible();
  await expect(table(page).getByText(/Scenario: \$10,000\.00 for 12 months/)).toBeVisible();
});

// E5 step 2: no scroll box inside the page scroll; the region scrolls sideways only
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`at ${String(viewport.width)}px the results scroll with the page, not inside a box`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/compare/cd');
    if (viewport.width < 1024) {
      await expect(page.getByRole('list', { name: 'Certificates of deposit' })).toBeVisible();
    } else {
      const region = page.getByRole('region', { name: 'Certificates of deposit' });
      const clipsHeight = await region.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
      expect(clipsHeight).toBe(false);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
}

test('on a phone the results are cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/compare/cd');
  await expect(page.getByRole('list', { name: 'Certificates of deposit' })).toBeVisible();
  await expect(table(page)).toBeHidden();
});

test('at 1280px the header row and the first column stick', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/compare/cd');
  const headers = table(page).getByRole('columnheader');
  const positions = await headers.evaluateAll((cells) =>
    cells.map((cell) => getComputedStyle(cell).position),
  );
  expect(positions.every((position) => position === 'sticky')).toBe(true);
});

test('at 1024px with a profile (all columns) the page does not scroll sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/compare/cd?profile=filingStatus');
  await fillSingleNy(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

// AC-6: the ad slot is labeled, in the static HTML, above the table and never inside it
test('the sponsored slot is labeled, prerendered and outside the table', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/compare/cd')).text();
  expect(html).toContain('data-sponsored="compare_top"');

  await page.goto('/compare/cd');
  const slot = page.getByRole('complementary', { name: 'Sponsored' });
  await expect(slot).toBeVisible();
  await expect(slot.getByText(/^Sponsored · /).first()).toBeVisible();
  await expect(slot.getByRole('link').first()).toHaveAttribute('rel', /sponsored/);
  await expect(page.locator('table [data-sponsored], table aside')).toHaveCount(0);
  const slotBox = await slot.boundingBox();
  const tableBox = await table(page).boundingBox();
  expect((slotBox?.y ?? 0) + (slotBox?.height ?? 0)).toBeLessThanOrEqual(tableBox?.y ?? 0);
});

test('no product matches the filters: the empty state says how to get them back', async ({
  page,
}) => {
  await page.goto('/compare/cd?search=zzzz-no-such-bank');
  await expect(
    page.getByText('No products match these filters. Remove some, or use Reset filters.'),
  ).toBeVisible();
});

test('products that need more data name the field and open the drawer on it', async ({ page }) => {
  await page.goto('/compare/cd?profile=filingStatus');
  await fillSingleNy(page);

  const note = page.getByRole('status').filter({ hasText: /more data from your profile/ });
  await expect(note).toBeVisible();
  await note.getByRole('button', { name: 'Add age' }).click();
  await expect(page.getByRole('dialog', { name: 'Your profile' }).getByLabel('Age')).toBeFocused();
});
