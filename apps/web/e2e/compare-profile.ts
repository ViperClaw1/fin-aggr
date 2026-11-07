import { expect, type Page } from '@playwright/test';

const RANKED = 'Ranked for your profile: eligible first, then by net interest after tax.';

/** A complete enough NY profile. Pass age when no row should still need data. */
export async function fillSingleNy(page: Page, age?: string): Promise<void> {
  const drawer = page.getByRole('dialog', { name: 'Your profile' });
  await drawer.getByLabel('Filing status').selectOption('single');
  await drawer.getByLabel('State of residence').selectOption('NY');
  const income = drawer.getByLabel('Taxable income');
  await income.fill('85000');
  await income.blur();
  await drawer.getByLabel('Residency').selectOption('us_citizen');
  if (age !== undefined) {
    const field = drawer.getByLabel('Age');
    await field.fill(age);
    await field.blur();
  }
  await page.keyboard.press('Escape');
  await expect(page.getByText(RANKED)).toBeVisible();
}
