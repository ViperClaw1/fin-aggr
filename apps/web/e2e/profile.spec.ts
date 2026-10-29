// The profile drawer and form (E5 step 1). The profile lives in this browser only (ADR-004).
import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './axe';

// a label that only the lazily loaded form renders, so only its chunk carries it
const FORM_MARKER = 'Holding period, months';

// the dialog is inside the header too: the summary button is the one that opens it
const profileButton = (page: Page) => page.locator('header button[aria-haspopup="dialog"]');
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Your profile' });

async function openDrawer(page: Page) {
  await expect(profileButton(page)).toHaveText('No profile yet');
  await profileButton(page).click();
  await expect(drawer(page)).toBeVisible();
}

async function fillIncome(page: Page, text: string) {
  const income = drawer(page).getByLabel('Taxable income');
  await income.fill(text);
  await income.blur();
}

test('the profile survives a reload', async ({ page }) => {
  await page.goto('/');
  await openDrawer(page);
  await drawer(page).getByLabel('Filing status').selectOption('single');
  await drawer(page).getByLabel('State of residence').selectOption('NY');
  await fillIncome(page, '85000');
  await drawer(page).getByLabel('Residency').selectOption('us_citizen');
  await expect(profileButton(page)).toHaveText('Profile: NY · complete');

  // ?profile= is still in the URL, so the drawer opens again on its own
  await page.reload();
  await expect(profileButton(page)).toHaveText('Profile: NY · complete');
  await expect(drawer(page).getByLabel('Filing status')).toHaveValue('single');
  await expect(drawer(page).getByLabel('Taxable income')).toHaveValue('$85,000.00');
});

test('a broken file and a file over 16 KB are rejected, the profile is kept', async ({ page }) => {
  await page.goto('/');
  await openDrawer(page);
  await drawer(page).getByLabel('State of residence').selectOption('CA');
  const input = drawer(page).getByLabel('Import profile');

  await input.setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":'),
  });
  await expect(drawer(page).getByText(/Import failed: .*not a profile file/)).toBeVisible();

  await input.setInputFiles({
    name: 'big.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(16 * 1024 + 1, ' '),
  });
  await expect(drawer(page).getByText(/Import failed: .*larger than 16 KB/)).toBeVisible();
  await expect(drawer(page).getByLabel('State of residence')).toHaveValue('CA');
});

const VALID_FILE = {
  name: 'profile.json',
  mimeType: 'application/json',
  buffer: Buffer.from(
    JSON.stringify({ format: 'fa-profile', version: 1, profile: { stateCode: 'TX' } }),
  ),
};

test('importing over a filled profile asks first; Cancel keeps it', async ({ page }) => {
  await page.goto('/');
  await openDrawer(page);
  await drawer(page).getByLabel('State of residence').selectOption('CA');
  const input = drawer(page).getByLabel('Import profile');

  await input.setInputFiles(VALID_FILE);
  await expect(drawer(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await drawer(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(input).toBeFocused();
  await expect(drawer(page).getByLabel('State of residence')).toHaveValue('CA');

  await input.setInputFiles(VALID_FILE);
  await drawer(page).getByRole('button', { name: 'Replace' }).click();
  await expect(drawer(page).getByText('Profile imported.')).toBeVisible();
  await expect(drawer(page).getByLabel('State of residence')).toHaveValue('TX');
});

test('importing into an empty profile does not ask', async ({ page }) => {
  await page.goto('/');
  await openDrawer(page);
  await drawer(page).getByLabel('Import profile').setInputFiles(VALID_FILE);
  await expect(drawer(page).getByText('Profile imported.')).toBeVisible();
  await expect(drawer(page).getByLabel('State of residence')).toHaveValue('TX');
});

test('erasing asks first and clears the profile', async ({ page }) => {
  await page.goto('/');
  await openDrawer(page);
  await drawer(page).getByLabel('State of residence').selectOption('TX');
  await drawer(page).getByRole('button', { name: 'Erase profile' }).click();
  await expect(drawer(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await drawer(page).getByRole('button', { name: 'Erase', exact: true }).click();
  await expect(drawer(page).getByLabel('State of residence')).toHaveValue('');
  await expect(profileButton(page)).toHaveText('No profile yet');
});

test('the drawer works from the keyboard', async ({ page }) => {
  await page.goto('/');
  await expect(profileButton(page)).toHaveText('No profile yet');
  await profileButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(drawer(page).getByLabel('Filing status')).toBeFocused();
  await expect(page).toHaveURL(/[?&]profile=filingStatus/);

  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
  await expect(profileButton(page)).toBeFocused();
  await expect(page).not.toHaveURL(/[?&]profile=/);
});

test('after closing, Back leaves the page instead of reopening the drawer', async ({ page }) => {
  await page.goto('/');
  await page.goto('/compare/cd');
  await openDrawer(page);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/compare\/cd$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test('?profile=<field> opens the drawer on that field; closing replaces the URL', async ({
  page,
}) => {
  await page.goto('/');
  await page.goto('/?profile=cityMarginalRate');
  await expect(drawer(page).getByLabel('City income tax rate, %')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]profile=/);
});

test('the open drawer has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/?profile=filingStatus');
  await expect(drawer(page).getByLabel('Filing status')).toBeFocused();
  await expectNoA11yViolations(page, 'dialog');
});

for (const path of ['/', '/compare/cd']) {
  test(`the form is not in the first load of ${path}, only after opening`, async ({ page }) => {
    const scripts: Promise<string>[] = [];
    page.on('response', (response) => {
      if (response.request().resourceType() === 'script') scripts.push(response.text());
    });
    await page.goto(path);
    await expect(profileButton(page)).toHaveText('No profile yet');
    await page.waitForLoadState('networkidle');
    const before = await Promise.all(scripts);
    expect(before.filter((b) => b.includes(FORM_MARKER))).toHaveLength(0);

    await profileButton(page).click();
    await expect(drawer(page).getByLabel(FORM_MARKER)).toBeVisible();
    const after = await Promise.all(scripts);
    expect(after.filter((b) => b.includes(FORM_MARKER)).length).toBeGreaterThan(0);
  });
}

// AC-4: a sentinel income never reaches a request URL, header or body
test('the profile never leaves the browser (AC-4 sentinel)', async ({ page }) => {
  const SENTINEL = /987,?654/;
  const leaks: string[] = [];
  page.on('request', (request) => {
    const parts = [request.url(), JSON.stringify(request.headers()), request.postData() ?? ''];
    if (parts.some((p) => SENTINEL.test(p))) leaks.push(request.url());
  });

  await page.goto('/');
  await openDrawer(page);
  await drawer(page).getByLabel('State of residence').selectOption('NY');
  await fillIncome(page, '987654');
  await expect(profileButton(page)).toHaveText('Profile: 2 of 4 filled');

  for (const path of ['/compare/cd', '/compare/savings', '/']) {
    await page.goto(path);
    await expect(profileButton(page)).toHaveText('Profile: 2 of 4 filled');
  }
  await page.waitForLoadState('networkidle');
  expect(leaks).toEqual([]);
});
