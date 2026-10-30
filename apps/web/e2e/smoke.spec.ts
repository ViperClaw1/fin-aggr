import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './axe';

const fixtures = generateFixtures(Number(process.env.NEXT_PUBLIC_FA_SEED ?? DEFAULT_SEED));
const bank = fixtures.institutions.find((item) => item.kind === 'direct_bank');
const product = fixtures.products.find((item) => item.category === 'cd');

/** Every P0 route, including the ones added in E5. */
const P0_ROUTES = [
  '/',
  '/compare/cd',
  '/compare/savings',
  '/compare/treasury',
  `/product/${product?.id ?? ''}`,
  '/banks',
  `/banks/${bank?.id.replaceAll(':', '_') ?? ''}`,
  '/tools/fdic-coverage',
  '/tools/after-tax-yield',
  '/methodology',
  '/disclosure',
  '/privacy',
];

test('home renders without serious or critical axe violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);
});

test('every page shows the demo data banner (AC-5)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('complementary', { name: 'Demo data notice' })).toContainText(
    'DEMO DATA',
  );
});

for (const path of P0_ROUTES) {
  test(`${path} responds, shows the demo banner and has no serious or critical axe violations`, async ({
    page,
  }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Demo data notice' })).toContainText(
      'DEMO DATA',
    );
    await expectNoA11yViolations(page);
  });
}

test('the component stand is absent from the production build', async ({ request }) => {
  const response = await request.get('/dev/components');
  expect(response.status()).toBe(404);
});

test('every page has the footer with the info pages and the data set date', async ({ page }) => {
  await page.goto('/compare/cd');
  const footer = page.getByRole('contentinfo');
  for (const name of ['Methodology', 'Advertiser disclosure', 'Privacy']) {
    await expect(footer.getByRole('link', { name })).toBeVisible();
  }
  await expect(footer.getByText(/data set as of/i)).toBeVisible();
});

for (const path of ['/methodology', '/disclosure', '/privacy']) {
  test(`${path} is a marked draft without serious or critical axe violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Draft, pending legal review.')).toBeVisible();
    await expectNoA11yViolations(page);
  });
}

test('a compare page carries its title, canonical, Open Graph image and noindex', async ({
  page,
}) => {
  await page.goto('/compare/savings');
  await expect(page).toHaveTitle('Compare savings accounts · FA');
  const head = page.locator('head');
  await expect(head.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/compare\/savings$/,
  );
  await expect(head.locator('meta[name="description"]')).toHaveAttribute('content', /savings/i);
  await expect(head.locator('meta[property="og:image"]').first()).toHaveAttribute(
    'content',
    /\/compare\/savings\/opengraph-image/,
  );
  await expect(head.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
  await expect(head.locator('meta[name="theme-color"]')).toHaveCount(1);
});

test('robots.txt disallows crawling; the manifest and OG images are served', async ({
  request,
}) => {
  expect(await (await request.get('/robots.txt')).text()).toMatch(/Disallow: \//);
  expect((await request.get('/manifest.webmanifest')).ok()).toBe(true);
  for (const path of ['/opengraph-image', '/compare/cd/opengraph-image']) {
    const response = await request.get(path);
    expect(response.headers()['content-type']).toBe('image/png');
  }
});

test('the header switch turns the dark theme on and off; it has no axe violations', async ({
  page,
}) => {
  await page.goto('/compare/cd');
  const html = page.locator('html');
  await expect(html).not.toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(html).not.toHaveAttribute('data-theme', 'dark');
});

test('an unknown page shows the not-found page with a way home', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute(
    'href',
    '/',
  );
  await expectNoA11yViolations(page);
});
