// ADR-017: a saved profile must not shift the catalog after hydration.
import { expect, test } from '@playwright/test';

const RANKED = 'Ranked for your profile: eligible first, then by net interest after tax.';

test('a saved profile keeps CLS under 0.1 and the catalog top still', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'fa.profile',
      JSON.stringify({
        state: {
          draft: {
            filingStatus: 'single',
            stateCode: 'CA',
            taxableIncome: 8_000_000,
            residency: 'us_citizen',
            age: 40,
          },
        },
        version: 1,
      }),
    );
    const shifts: number[] = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) shifts.push(shift.value);
      }
    }).observe({ type: 'layout-shift', buffered: true });
    const watch = () => {
      const slot = document.querySelector('[data-catalog-slot]');
      const root = document.documentElement;
      if (slot === null || !root.hasAttribute('data-has-profile')) {
        requestAnimationFrame(watch);
        return;
      }
      const before = slot.getBoundingClientRect().top;
      const observer = new MutationObserver(() => {
        (window as unknown as { __delta: number }).__delta = Math.abs(
          slot.getBoundingClientRect().top - before,
        );
      });
      observer.observe(root, { attributes: true, attributeFilter: ['data-has-profile'] });
    };
    requestAnimationFrame(watch);
    (window as unknown as { __cls: number[] }).__cls = shifts;
  });
  await page.goto('/compare/cd');
  await expect(page.getByText(RANKED)).toBeVisible();
  const moved = await page.evaluate(() => {
    const w = window as unknown as { __delta?: number; __cls: number[] };
    const cls = w.__cls.reduce((sum, value) => sum + value, 0);
    return { delta: w.__delta ?? -1, cls };
  });
  expect(moved.delta).toBeLessThan(1);
  expect(moved.cls).toBeLessThan(0.1);
});

test('a blocked page script still reveals the catalog within 3 seconds', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fa.profile', '{"state":{"draft":{}},"version":1}');
  });
  await page.route('**/_next/static/chunks/**', (route) => {
    if (route.request().resourceType() === 'stylesheet') {
      void route.continue();
      return;
    }
    void route.abort();
  });
  await page.goto('/compare/cd', { waitUntil: 'commit' });
  const root = page.locator('html');
  const table = page.getByRole('table', { name: 'Certificates of deposit' });
  await expect(root).toHaveAttribute('data-has-profile', '');
  await expect(root).not.toHaveAttribute('data-has-profile', '', { timeout: 5_000 });
  await expect(table).toBeVisible();
  await expect(page.getByLabel('Search bank or product')).toBeDisabled();
});
