import { Cents } from '@fa/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EngineError } from './errors';
import { D } from './money';
import { bracketTax, taxesOnInterest } from './tax';
import { TABLES } from './test-data';

const MAX_RATE = new D('0.40');
const single = TABLES.federal.single;
const income = fc.integer({ min: 0, max: 100_000_000_00 });
const profile = {
  filingStatus: 'single',
  stateCode: 'CA',
  taxableIncome: Cents.parse(0),
  cityMarginalRate: null,
} as const;

describe('bracketTax properties', () => {
  it('is monotone in income', () => {
    fc.assert(
      fc.property(income, income, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(bracketTax(single, new D(lo)).lte(bracketTax(single, new D(hi)))).toBe(true);
      }),
    );
  });
  it('never exceeds income × the top rate', () => {
    fc.assert(
      fc.property(income, (x) => {
        expect(bracketTax(single, new D(x)).lte(new D(x).times(MAX_RATE))).toBe(true);
      }),
    );
  });
  it('is zero for zero and negative income', () => {
    expect(bracketTax(single, new D(0)).isZero()).toBe(true);
    expect(bracketTax(single, new D(-500)).isZero()).toBe(true);
  });
});

describe('taxesOnInterest errors', () => {
  const input = { tables: TABLES, profile, taxTreatment: 'taxable', base: new D(100) } as const;
  it('a negative base is invalid_input', () => {
    expect(() => taxesOnInterest({ ...input, base: new D(-1) })).toThrow(EngineError);
  });
  it('a state missing from the tables is invalid_input', () => {
    expect(() => taxesOnInterest({ ...input, profile: { ...profile, stateCode: 'ZZ' } })).toThrow(
      /invalid_input: no tax rate for ZZ/,
    );
  });
  it('an exempt product does not need the state rate', () => {
    const t = taxesOnInterest({
      ...input,
      taxTreatment: 'state_local_exempt',
      profile: { ...profile, stateCode: 'ZZ' },
    });
    expect(t.state.isZero()).toBe(true);
  });
});
