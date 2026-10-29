import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from '../axe';

const chart = (page: Page, id: string) => page.getByTestId(id);
const valueBar = (page: Page, id: string) => chart(page, id).locator('rect[data-part="value"]');

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/components');
});

test('charts have no serious or critical axe violations', async ({ page }) => {
  await expectNoA11yViolations(page, 'section[aria-labelledby="charts"]');
});

test('the drawing is hidden from assistive technology, the text carries the values', async ({
  page,
}) => {
  const below = chart(page, 'bullet-below');
  await expect(below.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(below.getByRole('group', { name: 'Balance at Alder Savings' })).toContainText(
    'Value$60,000.00',
  );
  await expect(below).toContainText('Demo limit$100,000.00');
});

test('bar width is proportional to the value', async ({ page }) => {
  await expect(valueBar(page, 'bullet-below')).toHaveAttribute('width', '40');
  await expect(valueBar(page, 'bullet-at')).toHaveAttribute('width', '100');
  await expect(chart(page, 'bullet-below').locator('line[data-part="marker"]')).toHaveAttribute(
    'x1',
    /^66\.66/,
  );
});

test('a value over the scale stops at the edge and says so in words', async ({ page }) => {
  await expect(valueBar(page, 'bullet-over')).toHaveAttribute('width', '100');
  await expect(chart(page, 'bullet-over')).toContainText('Over by $30,000.00');
  await expect(chart(page, 'bullet-at')).not.toContainText('Over by');
});

test('a rate chart labels its median and ranges', async ({ page }) => {
  const rate = chart(page, 'bullet-rate');
  await expect(rate).toContainText('Value8.1%');
  await expect(rate).toContainText('Market median9.5%');
  await expect(rate).toContainText('Typicalup to 12%');
  await expect(rate.locator('svg rect')).toHaveCount(4);
});

test.describe('on a 375 px screen', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('the page does not scroll sideways', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    // <= 0: the reserved scrollbar gutter (globals.css) makes the page narrower, never wider
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
