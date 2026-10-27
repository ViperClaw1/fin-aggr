// The engine on the generated data set (E2 decisions 5 and 6). Lives here, not in packages/engine,
// because engine-is-pure keeps fixtures out of the engine package, tests included.
import { Profile } from '@fa/contracts';
import { evaluateEligibility, rankProducts, toEligibilityContext } from '@fa/engine';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, generateFixtures } from './index';

const f = generateFixtures(DEFAULT_SEED);
const PROFILE = Profile.parse({
  version: 1,
  taxYear: 2026,
  filingStatus: 'single',
  stateCode: 'NY',
  taxableIncome: 7500000,
  cityMarginalRate: '0.03',
  residency: 'us_citizen',
  age: null,
  scenario: { principal: 2500000, holdingMonths: 6 },
});

describe('eligibility rules of every fixture product', () => {
  it.each([
    ['a full profile', toEligibilityContext({ ...PROFILE, age: 40 })],
    ['an empty profile', toEligibilityContext({})],
  ])('evaluate without invalid_rule against %s', (_, ctx) => {
    for (const p of f.products) expect(() => evaluateEligibility(p.eligibility, ctx)).not.toThrow();
  });
});

describe('rankProducts on the fixtures', () => {
  const ranked = rankProducts(f.products, PROFILE, f.taxTables);

  it('ranks all 120 products and uses all three groups', () => {
    expect(ranked).toHaveLength(120);
    expect(new Set(ranked.map((r) => r.group))).toEqual(
      new Set(['eligible', 'needs_profile', 'ineligible']),
    );
  });
  it('ranks are 1..n over the eligible group only', () => {
    const eligible = ranked.filter((r) => r.group === 'eligible');
    expect(eligible.map((r) => r.rank)).toEqual(eligible.map((_, i) => i + 1));
    expect(ranked.filter((r) => r.group !== 'eligible').every((r) => r.rank === null)).toBe(true);
  });
  it('federal_exempt products pay no federal tax, state_local_exempt ones no state or city tax', () => {
    const treatment = new Map(f.products.map((p) => [p.id, p.taxTreatment]));
    const taxed = (kind: string): number[][] =>
      ranked
        .filter((r) => treatment.get(r.productId) === kind)
        .flatMap((r) => (r.netYield === null ? [] : [r.netYield]))
        .map((y) => [y.federalTax, y.stateTax + y.localTax]);
    const federalExempt = taxed('federal_exempt');
    const stateExempt = taxed('state_local_exempt');
    expect(federalExempt.length > 0 && stateExempt.length > 0).toBe(true);
    expect(federalExempt.map(([federal]) => federal)).toEqual(federalExempt.map(() => 0));
    expect(stateExempt.map(([, local]) => local)).toEqual(stateExempt.map(() => 0));
  });
  it('reversing the input does not change the output', () => {
    expect(rankProducts([...f.products].reverse(), PROFILE, f.taxTables)).toEqual(ranked);
  });
});
