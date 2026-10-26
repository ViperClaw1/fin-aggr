import { expect, test } from '@playwright/test';
import { contentSecurityPolicy } from '../security-headers';

// ADR-015. Add each P0 route here as it lands (E5).
const ROUTES = ['/'];

for (const route of ROUTES) {
  test(`${route} sends the production CSP`, async ({ request }) => {
    const response = await request.get(route);
    expect(response.headers()['content-security-policy']).toBe(contentSecurityPolicy(false));
  });
}

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
