import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rankProducts } from './rank';
import { product, profile, TABLES } from './test-data';

const tier = (apy: string): unknown => [{ minBalance: 0, maxBalance: null, apy }];
const PRODUCTS = [
  product('p_b', { tiers: tier('0.05') }),
  product('p_e', { eligibility: { op: 'eq', field: 'residency', value: 'nonresident' } }),
  product('p_c', { tiers: tier('0.04') }),
  product('p_d', { eligibility: { op: 'gte', field: 'age', value: 18 } }),
  product('p_a', { tiers: tier('0.05') }),
  product('p_f', { minOpening: 2000000 }),
];
const NO_AGE = profile({ age: null });

describe('rankProducts', () => {
  // independent calc: ordering rules of spec §5 applied by hand to PRODUCTS
  it('golden: groups, then net interest, then id; only eligible products get a rank', () => {
    const ranked = rankProducts(PRODUCTS, NO_AGE, TABLES);
    expect(ranked.map((r) => [r.productId, r.group, r.rank])).toEqual([
      ['p_a', 'eligible', 1],
      ['p_b', 'eligible', 2],
      ['p_c', 'eligible', 3],
      ['p_d', 'needs_profile', null],
      ['p_e', 'ineligible', null],
      ['p_f', 'ineligible', null],
    ]);
  });
  it('ineligible products carry no net yield, needs_profile ones do', () => {
    const ranked = rankProducts(PRODUCTS, NO_AGE, TABLES);
    const yieldOf = (id: string): boolean =>
      ranked.find((r) => r.productId === id)?.netYield !== null;
    expect([yieldOf('p_d'), yieldOf('p_e')]).toEqual([true, false]);
  });
  it('the minimum opening deposit shows up in the trace', () => {
    const f = rankProducts(PRODUCTS, NO_AGE, TABLES).find((r) => r.productId === 'p_f');
    const labels = f?.eligibility.trace.children?.map((c) => c.label);
    expect(labels).toContain('Minimum opening deposit');
  });
  it('a permutation of the input does not change the output', () => {
    const expected = rankProducts(PRODUCTS, NO_AGE, TABLES);
    fc.assert(
      fc.property(
        fc.shuffledSubarray(PRODUCTS, { minLength: PRODUCTS.length, maxLength: PRODUCTS.length }),
        (shuffled) => {
          expect(rankProducts(shuffled, NO_AGE, TABLES)).toEqual(expected);
        },
      ),
    );
  });
});
