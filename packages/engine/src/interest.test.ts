import { Cents, EarlyWithdrawal, Rate } from '@fa/contracts';
import type { Decimal } from 'decimal.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EngineError } from './errors';
import { computeInterest, growth } from './interest';
import { D } from './money';

describe('growth cache', () => {
  it('a cached factor equals a fresh computation, on first and repeated calls', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1500 }), fc.integer({ min: 1, max: 120 }), (bp, m) => {
        const apy = Rate.parse(`0.${String(bp).padStart(4, '0')}`);
        const years = new D(m).div(12);
        const fresh = new D(apy).plus(1).pow(years).minus(1);
        expect([growth(apy, years).toString(), growth(apy, years).toString()]).toEqual([
          fresh.toString(),
          fresh.toString(),
        ]);
      }),
    );
  });
});
import { cd, THREE_TIERS, tiers } from './test-data';

const P = Cents.parse(1000000);
const MONTHS_6 = EarlyWithdrawal.parse({ kind: 'months_of_interest', months: 6 });
const marginalSavings = cd({
  category: 'savings',
  termMonths: null,
  tierMode: 'marginal',
  tiers: THREE_TIERS,
});

describe('term', () => {
  it('holding past the term earns only the term and flags it', () => {
    const r = computeInterest(cd(), P, 18);
    expect([r.months, r.cappedAtTerm, r.closedEarly]).toEqual([12, true, false]);
  });
  it('holding exactly the term is neither early nor capped', () => {
    const r = computeInterest(cd({ earlyWithdrawal: MONTHS_6 }), P, 12);
    expect([r.months, r.cappedAtTerm, r.closedEarly, r.penalty.isZero()]).toEqual([
      12,
      false,
      false,
      true,
    ]);
  });
  it('a product without a term is never closed early', () => {
    const r = computeInterest(marginalSavings, P, 3);
    expect([r.closedEarly, r.cappedAtTerm, r.penalty.isZero()]).toEqual([false, false, true]);
  });
});

describe('invalid input', () => {
  it.each([0, -1, 1.5])('holdingMonths %s is invalid_input', (months) => {
    expect(() => computeInterest(cd(), P, months)).toThrow(/^invalid_input/);
  });
  it('whole_balance in a gap between tiers is no_tier', () => {
    const gap = cd({ tiers: tiers([0, 99999, '0.04'], [200000, null, '0.05']) });
    expect(() => computeInterest(gap, Cents.parse(150000), 12)).toThrow(EngineError);
  });
  it('marginal below the first minimum is no_tier', () => {
    const high = cd({ tierMode: 'marginal', tiers: tiers([100000, null, '0.05']) });
    expect(() => computeInterest(high, Cents.parse(99999), 12)).toThrow(/^no_tier/);
  });
  it('marginal on a zero principal earns nothing', () => {
    expect(computeInterest(marginalSavings, Cents.parse(0), 12).gross.isZero()).toBe(true);
  });
});

describe('properties', () => {
  const principal = fc.integer({ min: 0, max: 50_000_000_00 });
  it('marginal gross interest never falls as the principal grows', () => {
    fc.assert(
      fc.property(principal, principal, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const g = (p: number): Decimal =>
          computeInterest(marginalSavings, Cents.parse(p), 12).gross;
        expect(g(lo).lte(g(hi))).toBe(true);
      }),
    );
  });
  it('marginal portions add up to the principal', () => {
    fc.assert(
      fc.property(principal, (p) => {
        const { portions } = computeInterest(marginalSavings, Cents.parse(p), 12);
        const total = portions.reduce((s, x) => s.plus(x.amount), new D(0));
        expect(total.toString()).toBe(String(p));
      }),
    );
  });
});
