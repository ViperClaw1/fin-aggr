import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from '../axe';

const section = (page: Page) => page.getByRole('region', { name: 'Values' });
const summary = (page: Page) => section(page).locator('summary');

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/components');
});

test('values have no serious or critical axe violations, also with the panel open', async ({
  page,
}) => {
  await summary(page).click();
  await expectNoA11yViolations(page, 'section[aria-labelledby="values"]');
});

test('rates are formatted, a negative one with a minus sign', async ({ page }) => {
  await expect(section(page).getByText('4.35%', { exact: true })).toBeVisible();
  await expect(section(page).getByText('−3.12%', { exact: true })).toBeVisible();
});

test('the explanation opens with Enter and Space and closes with Escape', async ({ page }) => {
  const details = section(page).locator('details');
  await expect(summary(page)).toHaveAccessibleName(/^3\.24%\s?, How is this calculated\?$/);
  await summary(page).focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(details).not.toHaveAttribute('open');
  await expect(summary(page)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(details).toHaveAttribute('open', '');
});

test('the open panel does not move the text around it', async ({ page }) => {
  const after = section(page).getByTestId('after-rate');
  // boxes are viewport-relative: scroll first so the click does not scroll the page
  await summary(page).scrollIntoViewIfNeeded();
  const before = await after.boundingBox();
  await summary(page).click();
  await expect(section(page).getByText('Net interest / principal, per year.')).toBeVisible();
  expect(await after.boundingBox()).toEqual(before);
});

test('warn and danger cards say why in text', async ({ page }) => {
  await expect(section(page).getByRole('group', { name: 'Capital ratio' })).toContainText(
    'Below median',
  );
  await expect(section(page).getByRole('group', { name: 'Problem loans' })).toContainText(
    'Far above median',
  );
});

test('freshness shows a machine date and relative text for a fixed now', async ({ page }) => {
  const today = section(page).locator('time[datetime="2026-10-28T08:00:00Z"]');
  await expect(today).toHaveText('Updated today');
  // past the 90-day threshold for terms (STALE_AFTER_DAYS.terms)
  await expect(section(page).locator('time[datetime="2026-07-01"]')).toHaveText(
    'Updated 119 days ago',
  );
  await expect(section(page).getByText('may be outdated')).toHaveCount(1);
});

test('ExplainMath lists the steps, omits empty inputs, and edits from the keyboard', async ({
  page,
}) => {
  const math = section(page).getByRole('region', { name: 'How this is calculated' });
  await expect(math.locator('ol > li')).toHaveCount(3);
  await expect(math.locator('ol > li').nth(2).locator('dl')).toHaveCount(0);
  const edit = math.getByRole('button', { name: 'Edit assumption: City tax rate is 0%.' });
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(section(page).getByTestId('edited-assumption')).toHaveText('Edited: city_rate');
  await expect(math.getByRole('button')).toHaveCount(1);
});

test.describe('on a 375 px screen', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('the page does not scroll sideways with the panel open', async ({ page }) => {
    await summary(page).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    // <= 0: the reserved scrollbar gutter (globals.css) makes the page narrower, never wider
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
