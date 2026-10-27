import { Cents, Rate } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { mulRate, sumCents } from './money';
// independent calc: packages/engine/golden/money.py, whose output is money.json
import EXPECTED from '../golden/money.json';

const MAX = Cents.parse(Number.MAX_SAFE_INTEGER);
const c = (n: number): Cents => Cents.parse(n);
const r = (s: string): Rate => Rate.parse(s);

describe('mulRate golden cases', () => {
  it('golden: half a cent rounds up', () => {
    expect(mulRate(c(1), r('0.5'))).toBe(EXPECTED.halfCentRoundsUp);
  });
  it('golden: 1.5 cents rounds up to 2', () => {
    expect(mulRate(c(3), r('0.5'))).toBe(EXPECTED.oneAndHalfRoundsUp);
  });
  it('golden: minus half a cent rounds away from zero', () => {
    expect(mulRate(c(-1), r('0.5'))).toBe(EXPECTED.negativeHalfRoundsAwayFromZero);
  });
  it('golden: 1.49995 cents rounds down', () => {
    expect(mulRate(c(29999), r('0.00005'))).toBe(EXPECTED.justBelowHalfRoundsDown);
  });
  it('golden: 1.50005 cents rounds up', () => {
    expect(mulRate(c(30001), r('0.00005'))).toBe(EXPECTED.justAboveHalfRoundsUp);
  });
  it('golden: $1,234,567.89 at 4.35%', () => {
    expect(mulRate(c(123456789), r('0.0435'))).toBe(EXPECTED.typicalInterest);
  });
  it('golden: the largest safe amount at rate 1 stays exact', () => {
    expect(mulRate(MAX, r('1'))).toBe(EXPECTED.maxTimesOne);
  });
});

describe('sumCents golden cases', () => {
  it('golden: sums up to the largest safe amount exactly', () => {
    expect(sumCents([c(Number.MAX_SAFE_INTEGER - 1), c(1)])).toBe(EXPECTED.sumToMax);
  });
});
