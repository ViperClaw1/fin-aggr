import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { billApy, noteApy, regDdApy } from './apy';

const percent2 = (rate: string): string =>
  new Decimal(rate).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString();

describe('treasury APY', () => {
  it('reproduces the Reg DD Appendix A worked examples', () => {
    // independent calc: 12 CFR 1030 Appendix A, Part I, examples (1) and (2), printed results
    expect(percent2(regDdApy('61.68', '1000', 365))).toBe('6.17');
    expect(percent2(regDdApy('30.37', '1000', 182))).toBe('6.18');
  });

  it('is the plain ratio when the term is exactly a year', () => {
    // independent calc: 61.68 / 1000 = 0.06168, exponent 365/365 = 1
    expect(regDdApy('61.68', '1000', 365)).toBe('0.06168');
  });

  it('prices a bill as Interest = 100 − P on Principal = P', () => {
    // independent calc: 5 / 95 = 0.0526315789…, half-up to 8 places
    expect(billApy('95', 365)).toBe('0.05263158');
  });

  it('puts a half-year bill just above its investment rate', () => {
    // 26-week bill, TreasuryDirect auction 2026-10-05: price 97.894361, 182 days, rate 4.314%
    const apy = new Decimal(billApy('97.894361', 182));
    expect(apy.gt('0.04314')).toBe(true);
    expect(apy.lt('0.0437')).toBe(true);
  });

  it('compounds a semiannual note yield twice a year', () => {
    // independent calc: 1.02^2 − 1 = 0.0404; 1.02125^2 − 1 = 0.0429515625 → 0.04295156
    expect(noteApy('4')).toBe('0.0404');
    expect(noteApy('4.25')).toBe('0.04295156');
  });

  it('rejects inputs that cannot be a yield', () => {
    expect(() => billApy('101', 182)).toThrow('above par');
    expect(() => billApy('0', 182)).toThrow('positive');
    expect(() => regDdApy('1', '100', 0)).toThrow('days in term');
    expect(() => noteApy('-1')).toThrow('positive');
  });
});
