import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from '../axe';

const values = (page: Page) => page.getByTestId('input-values');

/** Types into a field by its label and leaves it with Tab, which triggers parsing. */
async function enter(page: Page, label: string, text: string): Promise<void> {
  await page.getByLabel(label, { exact: true }).fill(text);
  await page.keyboard.press('Tab');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/components');
});

test('inputs have no serious or critical axe violations, also with an error shown', async ({
  page,
}) => {
  await enter(page, 'Balance', '1.234');
  await expectNoA11yViolations(page, 'section[aria-labelledby="inputs"]');
});

test('grouped dollars become cents on blur', async ({ page }) => {
  await enter(page, 'Balance', '1,234.56');
  await expect(values(page)).toContainText('"balance":123456');
  await expect(page.getByLabel('Balance', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'false',
  );
});

test('a third decimal shows an error linked to the field', async ({ page }) => {
  await enter(page, 'Balance', '1.234');
  const field = page.getByLabel('Balance', { exact: true });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription(/Too many decimal places/);
  await expect(values(page)).toContainText('"balance":null');
});

test('a negative balance is rejected, a negative fee is accepted', async ({ page }) => {
  await enter(page, 'Balance', '-5');
  await expect(page.getByLabel('Balance', { exact: true })).toHaveAccessibleDescription(
    /zero or a positive/,
  );
  await enter(page, 'Fee or refund', '-5');
  await expect(values(page)).toContainText('"fee":-500');
});

test('a percent becomes a rate fraction', async ({ page }) => {
  await enter(page, 'City tax rate', '3.876');
  await expect(values(page)).toContainText('"rate":"0.03876"');
});

test('a state is chosen from the keyboard', async ({ page }) => {
  await page.getByLabel('State of residence', { exact: true }).focus();
  // one key: multi-key type-ahead resets after ~1 s and is flaky on a loaded machine
  await page.keyboard.press('W');
  await expect(page.getByLabel('State of residence', { exact: true })).toHaveValue('WA');
  await expect(values(page)).toContainText('"state":"WA"');
});
