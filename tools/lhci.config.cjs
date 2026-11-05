// Mobile Lighthouse against `pnpm start`. Nine runs: five was too noisy on the shared runner
// (ADR-016, run 41994137865, median 0.84). /compare/cd fails below 0.80. 0.85 stays a warning
// until step 2.9 holds a nine-run median at or above 0.90. CLS still fails the job.
// TBT stays a warning: the with-profile median was 614 ms on that run.
// LHCI_PROFILE=1 seeds a complete draft and keeps it: Lighthouse clears storage unless
// disableStorageReset is set. The anonymous run leaves the default (storage is cleared).
// chromePath is filled by tools/lhci-prepare.mjs: Puppeteer 25's executablePath() is async.
const withProfile = process.env.LHCI_PROFILE === '1';

const origin = 'http://127.0.0.1:3000';

const collect = {
  url: [`${origin}/`, `${origin}/compare/cd`, `${origin}/product/prod_cd_0001`, `${origin}/banks`],
  numberOfRuns: 9,
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
            // One key per matrix row. LHCI keeps a single assertion per audit id.
            'categories:performance': ['error', { minScore: 0.8, aggregationMethod: 'median' }],
            'total-blocking-time': ['warn', { maxNumericValue: 300, aggregationMethod: 'median' }],
            'cumulative-layout-shift': [
              'error',
              { maxNumericValue: 0.1, aggregationMethod: 'median' },
            ],
          },
        },
        {
          matchingUrlPattern: '/compare/cd$',
          assertions: {
            'categories:performance': ['warn', { minScore: 0.85, aggregationMethod: 'median' }],
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
