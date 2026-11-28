import { describe, expect, it } from 'vitest';
import { apyRateFailures, nationalOutliers } from './checks';

const cd = (termMonths: number, apyPercent: string, ratePercent = '') => ({
  termMonths,
  apyPercent,
  ratePercent,
});

describe('check 5: APY against the stated rate', () => {
  it('passes an APY the rate produces with its compounding', () => {
    // independent calc: (1 + 0.045/365)^365 − 1 = 0.046025 → 4.60%; (1 + 0.045/12)^12 − 1 = 0.045940 → 4.59%
    expect(apyRateFailures([cd(12, '4.60', '4.50')], 'daily')).toEqual([]);
    expect(apyRateFailures([cd(12, '4.59', '4.50')], 'monthly')).toEqual([]);
  });

  it('holds an APY more than 1 bp away from the recomputed one', () => {
    // independent calc: 4.50% monthly is 4.594%; 4.70% is 10.6 bp above it
    expect(apyRateFailures([cd(12, '4.70', '4.50')], 'monthly')).toEqual(['apy_rate_mismatch:12']);
  });

  it('skips a term whose page states no rate, and holds a rate it cannot parse', () => {
    expect(apyRateFailures([cd(12, '4.60')], 'daily')).toEqual([]);
    expect(apyRateFailures([cd(6, '4.60', 'four')], 'daily')).toEqual(['apy_rate_mismatch:6']);
  });
});

describe('check 7: outlier against the national rate', () => {
  const national = [
    { seriesId: 'NDR6MCD' as const, rate: '0.0150' },
    { seriesId: 'NDR12MCD' as const, rate: '0.0185' },
    { seriesId: 'SNDR' as const, rate: '0.0040' },
  ];

  it('allows up to the national rate + 3.00 pp and holds above it', () => {
    // independent calc: 1.85% + 3.00 pp = 4.85%
    expect(nationalOutliers([cd(12, '4.85')], 'cd', national)).toEqual([]);
    expect(nationalOutliers([cd(12, '4.86')], 'cd', national)).toEqual(['national_outlier:12']);
  });

  it('holds an APY at or below zero', () => {
    expect(nationalOutliers([cd(12, '0.00')], 'cd', national)).toEqual(['national_outlier:12']);
  });

  it('compares a term without a series with the nearest one, the shorter on a tie', () => {
    // 9 months: 6 and 12 are both 3 away → 6-month 1.50% + 3.00 pp = 4.50%
    expect(nationalOutliers([cd(9, '4.60')], 'cd', national)).toEqual(['national_outlier:9']);
    // 10 months: nearest is 12 → 4.85% bound
    expect(nationalOutliers([cd(10, '4.60')], 'cd', national)).toEqual([]);
  });

  it('compares savings with the savings series', () => {
    // independent calc: 0.40% + 3.00 pp = 3.40%
    expect(nationalOutliers([cd(0, '3.50')], 'savings', national)).toEqual(['national_outlier:0']);
  });

  it('fails closed without real national rates', () => {
    expect(nationalOutliers([cd(12, '4.00')], 'cd', [])).toEqual(['national_rates_missing']);
    expect(nationalOutliers([cd(36, '4.00')], 'cd', national)).toEqual([
      'national_rates_missing:NDR36MCD',
    ]);
  });
});
