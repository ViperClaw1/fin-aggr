import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from '../axe';

const section = (page: Page) => page.getByRole('region', { name: 'Entities' });

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/components');
});

test('entities have no serious or critical axe violations, also with panels open', async ({
  page,
}) => {
  for (const summary of await section(page).locator('summary').all()) await summary.click();
  await expectNoA11yViolations(page, 'section[aria-labelledby="entities"]');
});

test('a fact carries data-citation and opens its document with the right reference', async ({
  page,
}) => {
  const fact = section(page).getByTestId('fact').locator('[data-citation]').first();
  await expect(fact).toHaveAttribute('data-citation', 'stand_doc');
  await fact.getByRole('button', { name: 'example.com, p. 3' }).click();
  await expect(section(page).getByTestId('opened-citation')).toHaveText(
    'Opened: doc_stand_1 p3: Early withdrawal penalty: 90 days of interest.',
  );
});

test('a citation states verification, demo status and freshness in words', async ({ page }) => {
  const fact = section(page).getByTestId('fact');
  await expect(fact).toContainText('Verified 2026-10-20 (by a person)');
  await expect(fact).toContainText('Demo data');
  await expect(fact).toContainText('Updated yesterday');
});

test('a source without a document links out safely', async ({ page }) => {
  const link = section(page).getByTestId('citation-web').getByRole('link');
  await expect(link).toHaveAttribute('href', 'https://rates.example.org/savings');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(section(page).getByTestId('citation-web')).toContainText('Unverified');
});

test('badges are readable without colour', async ({ page }) => {
  const s = section(page);
  await expect(s.getByText('Not a bank', { exact: true })).toBeVisible();
  await expect(s.getByText('Credit union', { exact: true })).toBeVisible();
  const eligibility = s.getByTestId('eligibility');
  await expect(eligibility).toContainText('Eligible');
  await expect(eligibility).toContainText('Not available in NY');
  await expect(eligibility).toContainText(
    'Minimum opening deposit: deposit amount must be at least $1,000.00 (yours: $500.00)',
  );
  await expect(eligibility).toContainText('Add your age to check');
});

test.describe('on a 375 px screen', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('the page does not scroll sideways with every panel open', async ({ page }) => {
    // open panels overlap the next toggle on a narrow screen, so open them all directly
    await section(page)
      .locator('details')
      .evaluateAll((all) => {
        for (const d of all) (d as HTMLDetailsElement).open = true;
      });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    // <= 0: the reserved scrollbar gutter (globals.css) makes the page narrower, never wider
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
