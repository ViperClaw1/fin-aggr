// Mobile Lighthouse against `pnpm start`. Scores are warnings until E7 step 2 (docs/plan-e7.md).
// LHCI_PROFILE=1 seeds a complete draft and keeps it: Lighthouse clears storage unless
// disableStorageReset is set. The anonymous run leaves the default (storage is cleared).
// chromePath is filled by tools/lhci-prepare.mjs: Puppeteer 25's executablePath() is async.
const withProfile = process.env.LHCI_PROFILE === '1';

const origin = 'http://127.0.0.1:3000';

const collect = {
  url: [`${origin}/`, `${origin}/compare/cd`, `${origin}/product/prod_cd_0001`, `${origin}/banks`],
  numberOfRuns: 5,
  startServerCommand: 'pnpm --filter @fa/web start',
  startServerReadyPattern: 'Ready',
  startServerReadyTimeout: 60_000,
  settings: {},
};

if (withProfile) {
  // chromeFlags are ignored once a puppeteer script is set; launch args carry the sandbox flags.
  collect.puppeteerScript = 'tools/lhci-profile.cjs';
  collect.puppeteerLaunchOptions = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  collect.settings.disableStorageReset = true;
} else {
  collect.settings.chromeFlags = '--no-sandbox --disable-dev-shm-usage';
}

module.exports = {
  ci: {
    collect,
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: '/compare/cd$',
          assertions: {
            'categories:performance': ['warn', { minScore: 0.85, aggregationMethod: 'median' }],
            'total-blocking-time': ['warn', { maxNumericValue: 300, aggregationMethod: 'median' }],
            'cumulative-layout-shift': [
              'warn',
              { maxNumericValue: 0.1, aggregationMethod: 'median' },
            ],
          },
        },
      ],
    },
    upload: {
      target: 'filesystem',
      outputDir: withProfile ? '.lighthouseci/with-profile' : '.lighthouseci/anonymous',
    },
  },
};
