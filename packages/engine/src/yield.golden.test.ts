import { Cents, EarlyWithdrawal, Rate } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import type { YieldProduct } from './interest';
import { run, THREE_TIERS } from './test-data';
import type { NetYieldResult } from './yield';

// independent calc: packages/engine/golden/yield.py
// [gross, penalty, taxable, federal, state, local, net, netSimpleAnnualYield]
const EXPECTED = {
  cd12: [50000, 0, 50000, 10000, 3000, 0, 37000, '0.037'],
  crossing: [50000, 0, 50000, 13000, 3000, 0, 34000, '0.034'],
  savingsWhole: [45000, 0, 45000, 9000, 2700, 0, 33300, '0.0333'],
  savingsMarginal: [695000, 0, 695000, 139000, 41700, 0, 514300, '0.03428667'],
  treasury: [24695, 0, 24695, 4939, 0, 0, 19756, '0.039512'],
  penaltyDays: [24695, 12329, 12366, 2473, 742, 0, 9151, '0.018302'],
  penaltyMonths: [24695, 24695, 0, 0, 0, 0, 0, '0'],
  penaltyPercent: [24695, 10000, 14695, 2939, 882, 0, 10874, '0.021748'],
  penaltyAboveInterest: [4074, 24695, 0, 0, 0, 0, -20621, '-0.247452'],
  pastTerm: [50000, 0, 50000, 10000, 3000, 0, 37000, '0.02466667'],
  noStateTax: [50000, 0, 50000, 10000, 0, 0, 40000, '0.04'],
  cityRate: [50000, 0, 50000, 10000, 3000, 500, 36500, '0.0365'],
  federalExempt: [50000, 0, 50000, 0, 3000, 0, 47000, '0.047'],
} as const;

const lines = (r: NetYieldResult): readonly (number | string)[] => [
  r.grossInterest,
  r.earlyWithdrawalPenalty,
  r.taxableInterest,
  r.federalTax,
  r.stateTax,
  r.localTax,
  r.netInterest,
  r.netSimpleAnnualYield,
];
const penalty = (value: unknown): Partial<YieldProduct> => ({
  earlyWithdrawal: EarlyWithdrawal.parse(value),
});
const savings = (tierMode: YieldProduct['tierMode']): Partial<YieldProduct> => ({
  category: 'savings',
  termMonths: null,
  tierMode,
  tiers: THREE_TIERS,
});

describe('computeNetYield golden cases', () => {
  it('golden: 12-month CD, one tier, inside one bracket', () => {
    expect(lines(run())).toEqual(EXPECTED.cd12);
  });
  it('golden: interest crosses a federal bracket', () => {
    expect(lines(run({ profile: { taxableIncome: Cents.parse(7980000) } }))).toEqual(
      EXPECTED.crossing,
    );
  });
  it('golden: savings, whole_balance', () => {
    expect(lines(run({ product: savings('whole_balance') }))).toEqual(EXPECTED.savingsWhole);
  });
  it('golden: savings, marginal across three tiers', () => {
    expect(lines(run({ product: savings('marginal'), principal: 15000000 }))).toEqual(
      EXPECTED.savingsMarginal,
    );
  });
  it('golden: treasury pays no state or city tax', () => {
    const r = run({
      product: { category: 'treasury', termMonths: 6, taxTreatment: 'state_local_exempt' },
      holdingMonths: 6,
      profile: { cityMarginalRate: Rate.parse('0.01') },
    });
    expect(lines(r)).toEqual(EXPECTED.treasury);
  });
  it('golden: closed early, 90 days of interest', () => {
    const r = run({ product: penalty({ kind: 'days_of_interest', days: 90 }), holdingMonths: 6 });
    expect(lines(r)).toEqual(EXPECTED.penaltyDays);
  });
  it('golden: closed early, 6 months of interest', () => {
    const r = run({
      product: penalty({ kind: 'months_of_interest', months: 6 }),
      holdingMonths: 6,
    });
    expect(lines(r)).toEqual(EXPECTED.penaltyMonths);
  });
  it('golden: closed early, 1% of principal', () => {
    const p = penalty({ kind: 'percent_of_principal', rate: '0.01' });
    expect(lines(run({ product: p, holdingMonths: 6 }))).toEqual(EXPECTED.penaltyPercent);
  });
  it('golden: a penalty above the interest gives a negative result', () => {
    const r = run({
      product: penalty({ kind: 'months_of_interest', months: 6 }),
      holdingMonths: 1,
    });
    expect(lines(r)).toEqual(EXPECTED.penaltyAboveInterest);
  });
  it('golden: holding past the term earns the term only', () => {
    expect(lines(run({ holdingMonths: 18 }))).toEqual(EXPECTED.pastTerm);
  });
  it('golden: a state without income tax', () => {
    expect(lines(run({ profile: { stateCode: 'TX' } }))).toEqual(EXPECTED.noStateTax);
  });
  it('golden: a city rate on top of the state rate', () => {
    expect(lines(run({ profile: { cityMarginalRate: Rate.parse('0.01') } }))).toEqual(
      EXPECTED.cityRate,
    );
  });
  it('golden: federal_exempt keeps the state tax', () => {
    expect(lines(run({ product: { taxTreatment: 'federal_exempt' } }))).toEqual(
      EXPECTED.federalExempt,
    );
  });
});
