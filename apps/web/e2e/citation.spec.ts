// Citation viewer (E6). Highlight geometry, history, direct links, and every fixture quote.
import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './axe';

const fixtures = generateFixtures(Number(process.env.NEXT_PUBLIC_FA_SEED ?? DEFAULT_SEED));
const product = fixtures.products.find((item) => item.category === 'cd');
const quoteFact = fixtures.facts[0];

async function darkPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const span = document.querySelector('[data-quote-highlight]');
    const canvas = document.querySelector('dialog canvas');
    if (!(span instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) return 0;
    const context = canvas.getContext('2d');
    if (context === null) return 0;
    const spanBox = span.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    const scaleX = canvas.width / canvasBox.width;
    const scaleY = canvas.height / canvasBox.height;
    const y = (spanBox.top + spanBox.height / 2 - canvasBox.top) * scaleY;
    let hits = 0;
    for (let step = 0; step < spanBox.width; step += 2) {
      const x = (spanBox.left + step - canvasBox.left) * scaleX;
      const pixel = context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      const [red, green, blue] = [pixel[0] ?? 255, pixel[1] ?? 255, pixel[2] ?? 255];
      if (red + green + blue < 600) hits += 1;
    }
    return hits;
  });
}

test('the quote highlight covers the painted text', async ({ page }) => {
  expect(product).toBeDefined();
  await page.goto(`/product/${product?.id ?? ''}`);
  const button = page.locator('[data-citation] button').first();
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Source' });
  await expect(dialog.locator('[data-quote-highlight]').first()).toBeVisible({ timeout: 15_000 });
  expect(await darkPixels(page)).toBeGreaterThan(0);
});

test('Escape closes the panel and returns focus', async ({ page }) => {
  expect(product).toBeDefined();
  await page.goto(`/product/${product?.id ?? ''}`);
  const button = page.locator('main [data-citation] button').first();
  await button.click();
  await expect(page.getByRole('dialog', { name: 'Source' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/product\//);
  await expect(page).not.toHaveURL(/doc=/);
  await expect(button).toBeFocused();
});

test('Back closes the panel', async ({ page }) => {
  expect(product).toBeDefined();
  await page.goto(`/product/${product?.id ?? ''}`);
  await page.locator('main [data-citation] button').first().click();
  await expect(page).toHaveURL(/doc=/);
  await page.goBack();
  await expect(page).not.toHaveURL(/doc=/);
  await expect(page.getByRole('dialog', { name: 'Source' })).toBeHidden();
});

test('a direct link opens the panel on the cited page', async ({ page }) => {
  expect(quoteFact).toBeDefined();
  const fact = quoteFact;
  if (fact === undefined) return;
  const q = encodeURIComponent(fact.quote);
  await page.goto(`/?doc=${fact.documentId}&page=${String(fact.page)}&q=${q}`);
  const dialog = page.getByRole('dialog', { name: 'Source' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(new RegExp(`^Page ${String(fact.page)} of \\d+$`))).toBeVisible();
  await expect(dialog.locator('[data-quote-highlight]').first()).toBeVisible();
});

test('a page change replaces history so Back closes the panel', async ({ page }) => {
  expect(product).toBeDefined();
  await page.goto(`/product/${product?.id ?? ''}`);
  await page.locator('main [data-citation] button').first().click();
  const dialog = page.getByRole('dialog', { name: 'Source' });
  const next = dialog.getByRole('button', { name: 'Next page' });
  const previous = dialog.getByRole('button', { name: 'Previous page' });
  if (await next.isEnabled()) await next.click();
  else await previous.click();
  await expect(page).toHaveURL(/page=/);
  await page.goBack();
  await expect(page).not.toHaveURL(/doc=/);
});

test('an unknown document shows an error', async ({ page }) => {
  await page.goto('/?doc=no_such_doc&page=1&q=Missing');
  await expect(page.getByRole('dialog', { name: 'Source' }).getByRole('alert')).toContainText(
    'Document not found',
  );
});

test('the open panel has no serious accessibility violations', async ({ page }) => {
  expect(quoteFact).toBeDefined();
  const fact = quoteFact;
  if (fact === undefined) return;
  const q = encodeURIComponent(fact.quote);
  await page.goto(`/?doc=${fact.documentId}&page=${String(fact.page)}&q=${q}`);
  await expect(page.locator('[data-quote-highlight]').first()).toBeVisible();
  await expectNoA11yViolations(page, 'dialog');
});

test('every fixture quote opens on its page', async ({ page }) => {
  test.setTimeout(240_000);
  const dialog = page.getByRole('dialog', { name: 'Source' });
  for (const fact of fixtures.facts) {
    const q = encodeURIComponent(fact.quote);
    await page.goto(`/?doc=${fact.documentId}&page=${String(fact.page)}&q=${q}`);
    await expect(
      dialog.locator('p.text-sm').filter({ hasText: `Page ${String(fact.page)} of` }),
    ).toBeVisible({ timeout: 20_000 });
    // The span is in the DOM. Firefox's checkVisibility is false when a long quote sticks out
    // of the clipped text layer, so visibility is not the signal. The live text is.
    await expect(dialog.locator('p.sr-only')).toContainText('quote highlighted', {
      timeout: 20_000,
    });
  }
});

test('each fine-print fact opens on its page', async ({ page }) => {
  const withNotes = fixtures.products.find((item) =>
    fixtures.facts.some(
      (fact) => fact.productId === item.id && fact.key !== 'earlyWithdrawalPenalty',
    ),
  );
  expect(withNotes).toBeDefined();
  if (withNotes === undefined) return;
  const notes = fixtures.facts.filter(
    (fact) => fact.productId === withNotes.id && fact.key !== 'earlyWithdrawalPenalty',
  );
  await page.goto(`/product/${withNotes.id}`);
  const region = page.getByRole('region', { name: 'Fine print' });
  const buttons = region.locator('[data-citation] button');
  await expect(buttons).toHaveCount(notes.length);
  for (let i = 0; i < notes.length; i += 1) {
    const note = notes[i];
    if (note === undefined) continue;
    await buttons.nth(i).click();
    const dialog = page.getByRole('dialog', { name: 'Source' });
    await expect(
      dialog.locator('p.text-sm').filter({ hasText: `Page ${String(note.page)} of` }),
    ).toBeVisible();
    await expect(dialog.locator('[data-quote-highlight]').first()).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('a compare-row citation opens the panel', async ({ page }) => {
  const cited = fixtures.products.find(
    (item) => item.category === 'cd' && item.earlyWithdrawal.provenance.document !== undefined,
  );
  expect(cited).toBeDefined();
  if (cited === undefined) return;
  const bank = fixtures.institutions.find((item) => item.id === cited.institutionId);
  await page.goto('/compare/cd');
  const details = page.locator(
    `button[aria-label="Show details: ${bank?.name ?? 'Unknown bank'}, ${cited.name}"]`,
  );
  await details.scrollIntoViewIfNeeded();
  await details.click();
  await page.getByRole('button', { name: /, p\. \d+/ }).click();
  await expect(page.getByRole('dialog', { name: 'Source' })).toBeVisible();
  await expect(page).toHaveURL(/doc=/);
});

test('the compare page does not load pdf.js until a citation opens', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (request) => {
    urls.push(request.url());
  });
  await page.goto('/compare/cd');
  await expect(page.getByRole('heading', { name: /products/ })).toBeVisible();
  const leaked = urls.filter((url) => /pdf\.worker|pdfjs|\/mock-docs\//.test(url));
  expect(leaked).toEqual([]);
});
