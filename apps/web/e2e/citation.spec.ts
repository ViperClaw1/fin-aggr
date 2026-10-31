// Citation viewer (E6 step 2). The highlight has to sit on the painted glyphs, not only exist.
import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { expect, test } from '@playwright/test';

const fixtures = generateFixtures(Number(process.env.NEXT_PUBLIC_FA_SEED ?? DEFAULT_SEED));
const product = fixtures.products.find((item) => item.category === 'cd');

test('the quote highlight covers the painted text', async ({ page }) => {
  expect(product).toBeDefined();
  await page.goto(`/product/${product?.id ?? ''}`);
  await page.locator('[data-citation] button').first().click();
  const dialog = page.getByRole('dialog', { name: 'Source' });
  const highlight = dialog.locator('[data-quote-highlight]').first();
  await expect(highlight).toBeVisible();

  const dark = await page.evaluate(() => {
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
  expect(dark).toBeGreaterThan(0);
});
