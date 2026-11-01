// Complete draft, same envelope as apps/web/e2e/compare-cls.spec.ts, so the catalog ranks.
// The visit warms the HTTP cache; clear it before Lighthouse navigates (plan E7 step 1).
const PROFILE = JSON.stringify({
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
});

module.exports = async (browser, context) => {
  const page = await browser.newPage();
  try {
    await page.goto(context.url, { waitUntil: 'domcontentloaded' });
    await page.evaluate((raw) => {
      globalThis.localStorage.setItem('fa.profile', raw);
    }, PROFILE);
    const client = await page.createCDPSession();
    await client.send('Network.clearBrowserCache');
  } finally {
    await page.close();
  }
};
