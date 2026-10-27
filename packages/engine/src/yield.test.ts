import { Cents, EarlyWithdrawal, Rate } from '@fa/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { YieldProduct } from './interest';
import { run, tiers } from './test-data';

const ids = (r: ReturnType<typeof run>): string[] => r.assumptions.map((a) => a.id);
const MONTHS_6 = EarlyWithdrawal.parse({ kind: 'months_of_interest', months: 6 });
const DAYS_90 = EarlyWithdrawal.parse({ kind: 'days_of_interest', days: 90 });

describe('assumptions, warnings and steps', () => {
  it('always lists NIIT/AMT, the penalty tax base and simple yield', () => {
    expect(ids(run())).toEqual([
      'niit_amt_ignored',
      'penalty_reduces_taxable_interest',
      'simple_annual_yield',
    ]);
  });
  it('the penalty tax base is editable, NIIT/AMT is not', () => {
    const editable = Object.fromEntries(run().assumptions.map((a) => [a.id, a.editable]));
    expect([editable['penalty_reduces_taxable_interest'], editable['niit_amt_ignored']]).toEqual([
      true,
      false,
    ]);
  });
  it('treasury adds the effective yield assumption', () => {
    const r = run({ product: { category: 'treasury', taxTreatment: 'state_local_exempt' } });
    expect(ids(r)).toContain('treasury_effective_yield');
  });
  it('a days-of-interest penalty adds the day count assumption', () => {
    expect(ids(run({ product: { earlyWithdrawal: DAYS_90 } }))).toContain('day_count_365');
  });
  it('holding past the term warns that the rate is not renewed', () => {
    expect(run({ holdingMonths: 18 }).warnings).toEqual([
      'The rate is not renewed after the term: interest stops at maturity.',
    ]);
  });
  it('a negative result warns about the penalty', () => {
    const r = run({ product: { earlyWithdrawal: MONTHS_6 }, holdingMonths: 1 });
    expect(r.warnings).toEqual([
      'The early withdrawal penalty is larger than the interest earned.',
    ]);
  });
  it('held to term has no warnings', () => {
    expect(run().warnings).toEqual([]);
  });
  it('steps explain every line in order, ending with the yield', () => {
    const r = run();
    expect(r.steps.map((s) => s.id)).toEqual([
      'tiers',
      'gross',
      'penalty',
      'taxable',
      'federal',
      'state',
      'local',
      'net',
      'yield',
    ]);
    expect(r.steps.at(-1)?.result).toBe(r.netSimpleAnnualYield);
    expect(r.steps.find((s) => s.id === 'net')?.result).toBe('$370.00');
  });
  it('a zero principal is invalid_input', () => {
    expect(() => run({ principal: 0 })).toThrow(/^invalid_input/);
  });
});

const apy = fc
  .integer({ min: 0, max: 1500 })
  .map((bp) => Rate.parse(`0.${String(bp).padStart(4, '0')}`));
const penaltyArb = fc.oneof(
  fc.constant(EarlyWithdrawal.parse({ kind: 'none' })),
  fc
    .integer({ min: 1, max: 365 })
    .map((days) => EarlyWithdrawal.parse({ kind: 'days_of_interest', days })),
  fc
    .integer({ min: 1, max: 24 })
    .map((months) => EarlyWithdrawal.parse({ kind: 'months_of_interest', months })),
  apy.map((rate) => EarlyWithdrawal.parse({ kind: 'percent_of_principal', rate })),
);
const productArb = fc.record({
  termMonths: fc.integer({ min: 1, max: 60 }),
  tiers: apy.map((a) => tiers([0, null, a])),
  earlyWithdrawal: penaltyArb,
}) satisfies fc.Arbitrary<Partial<YieldProduct>>;
const principalArb = fc.integer({ min: 1, max: 1_000_000_000_00 });
const monthsArb = fc.integer({ min: 1, max: 72 });
const income = fc.integer({ min: 0, max: 50_000_000_00 });

describe('properties', () => {
  it('net interest never exceeds gross interest', () => {
    fc.assert(
      fc.property(
        productArb,
        principalArb,
        monthsArb,
        income,
        (product, principal, holdingMonths, inc) => {
          const r = run({
            product,
            principal,
            holdingMonths,
            profile: { taxableIncome: Cents.parse(inc) },
          });
          expect(r.netInterest).toBeLessThanOrEqual(r.grossInterest);
        },
      ),
    );
  });
  it('with no taxes, net = gross − penalty', () => {
    fc.assert(
      fc.property(productArb, principalArb, monthsArb, (product, principal, holdingMonths) => {
        const r = run({
          product: { ...product, taxTreatment: 'federal_exempt' },
          principal,
          holdingMonths,
          profile: { stateCode: 'TX' },
        });
        expect(r.netInterest).toBe(r.grossInterest - r.earlyWithdrawalPenalty);
      }),
    );
  });
  // Each tax line is rounded on its own, so net may dip by at most one cent per line (3 lines).
  it('held to term, net interest never falls by more than the per-line rounding', () => {
    fc.assert(
      fc.property(productArb, principalArb, principalArb, (product, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const net = (p: number): number =>
          run({ product, principal: p, holdingMonths: product.termMonths }).netInterest;
        expect(net(lo) - 3).toBeLessThanOrEqual(net(hi));
      }),
    );
  });
});
