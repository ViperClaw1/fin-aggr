import { RateTier } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { headlineApy } from './headline-apy';

const tiers = (...apys: string[]) =>
  apys.map((apy, i) => RateTier.parse({ minBalance: i * 100, maxBalance: i * 100 + 99, apy }));

describe('headlineApy', () => {
  it('is the only tier of a single-tier product', () => {
    expect(headlineApy({ tiers: tiers('0.045') })).toBe('0.045');
  });
  it('is the highest tier, wherever it sits', () => {
    expect(headlineApy({ tiers: tiers('0.04', '0.05', '0.045') })).toBe('0.05');
  });
  it('keeps the first of equal rates written differently', () => {
    expect(headlineApy({ tiers: tiers('0.0400', '0.04') })).toBe('0.0400');
  });
});
