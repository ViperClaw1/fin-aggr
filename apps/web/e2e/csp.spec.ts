import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { expect, test } from '@playwright/test';
import { contentSecurityPolicy, securityHeaders } from '../security-headers';

// ADR-015. Add each P0 route here as it lands (E5).
const ROUTES = ['/'];

for (const route of ROUTES) {
  test(`${route} sends the production CSP`, async ({ request }) => {
    const response = await request.get(route);
    const headers = response.headers();
    expect(headers['content-security-policy']).toBe(contentSecurityPolicy(false));
    for (const header of securityHeaders(false)) {
      expect(headers[header.key.toLowerCase()]).toBe(header.value);
    }
  });
}

test('the page loads without CSP violations', async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { cspViolations: seen });
    document.addEventListener('securitypolicyviolation', (e) => seen.push(e.effectiveDirective));
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const seen = await page.evaluate(
    () => (window as unknown as { cspViolations: string[] }).cspViolations,
  );
  expect(seen).toEqual([]);
});

test('the open citation panel loads without CSP violations', async ({ page }) => {
  const fact = generateFixtures(Number(process.env.NEXT_PUBLIC_FA_SEED ?? DEFAULT_SEED)).facts[0];
  expect(fact).toBeDefined();
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { cspViolations: seen });
    document.addEventListener('securitypolicyviolation', (e) => seen.push(e.effectiveDirective));
  });
  if (fact === undefined) return;
  const q = encodeURIComponent(fact.quote);
  await page.goto(`/?doc=${fact.documentId}&page=${String(fact.page)}&q=${q}`);
  await expect(page.locator('dialog canvas')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const seen = await page.evaluate(
    () => (window as unknown as { cspViolations: string[] }).cspViolations,
  );
  expect(seen).toEqual([]);
});

test('connect-src blocks a cross-origin fetch (AC-4)', async ({ page }) => {
  await page.goto('/');
  const directive = await page.evaluate(async () => {
    const violation = new Promise<string>((resolve) => {
      document.addEventListener(
        'securitypolicyviolation',
        (e) => {
          resolve(e.effectiveDirective);
        },
        { once: true },
      );
    });
    await fetch('https://example.invalid/').catch(() => undefined);
    return violation;
  });
  expect(directive).toBe('connect-src');
});
