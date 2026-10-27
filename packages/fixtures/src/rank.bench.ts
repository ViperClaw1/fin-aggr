// Spec §5 performance target, not a gate: rankProducts on 120 products in ≤ 50 ms.
// Run with `pnpm bench`. If it misses, move ranking to a Web Worker without changing signatures.
import { Profile } from '@fa/contracts';
import { rankProducts } from '@fa/engine';
import { expect, test } from 'vitest';
import { DEFAULT_SEED, generateFixtures } from './index';

const f = generateFixtures(DEFAULT_SEED);
const profile = Profile.parse({
  version: 1,
  taxYear: 2026,
  filingStatus: 'single',
  stateCode: 'CA',
  taxableIncome: 7500000,
  cityMarginalRate: null,
  residency: 'us_citizen',
  age: 40,
  scenario: { principal: 2500000, holdingMonths: 6 },
});

test('rankProducts on 120 products stays within 50 ms', async ({ bench }) => {
  const result = await bench('rankProducts, 120 products', () => {
    rankProducts(f.products, profile, f.taxTables);
  }).run();
  expect(result.latency.mean).toBeLessThan(50);
});
