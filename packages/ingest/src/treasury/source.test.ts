import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRate } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { latestOffers } from './offers';
import { validateTreasuryOffers } from './source';

const offers = latestOffers(
  readFileSync(join(import.meta.dirname, 'auctioned.snapshot.json'), 'utf8'),
);

describe('validateTreasuryOffers', () => {
  it('passes all eight terms through clean', () => {
    expect(validateTreasuryOffers(offers)).toEqual({
      clean: offers,
      suspicious: [],
      blocked: null,
    });
  });

  it('blocks the publish when a term is missing', () => {
    expect(validateTreasuryOffers(offers.slice(1)).blocked).toBe('terms');
  });

  it('blocks the publish when an APY is outside the product bounds', () => {
    const wild = offers.map((o, i) => (i === 0 ? { ...o, apy: parseRate('0.9') } : o));
    expect(validateTreasuryOffers(wild).blocked).toBe('rate bounds');
  });

  it('blocks the publish when Fiscal Data disagrees on a shared auction', () => {
    expect(validateTreasuryOffers(offers, ['912797VT1']).blocked).toBe('fiscal_mismatch:912797VT1');
  });
});
