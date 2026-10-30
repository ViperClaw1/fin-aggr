// Display of bank metrics. Expected strings are worked out by hand (ADR-013).
import { describe, expect, it } from 'vitest';
import { formatPercentPoints, formatShare, formatUsdFromThousands } from './format';

describe('formatUsdFromThousands', () => {
  it.each([
    [0, '$0'],
    [50, '$50,000'],
    [999, '$999,000'],
    [1_000, '$1M'],
    [1_500, '$1.5M'],
    [50_000, '$50M'],
    [1_200_000, '$1.2B'],
    [1_000_000, '$1B'],
    [90_000_000, '$90B'],
  ])('%i thousands → %s', (thousands, text) => {
    expect(formatUsdFromThousands(thousands)).toBe(text);
  });

  it('rejects a fractional or negative count', () => {
    expect(() => formatUsdFromThousands(1.5)).toThrow(/safe integer/);
    expect(() => formatUsdFromThousands(-1)).toThrow(/safe integer/);
  });
});

describe('formatPercentPoints and formatShare', () => {
  it.each([
    [0, '0%'],
    [6, '6%'],
    [6.5, '6.5%'],
    [1.25, '1.3%'],
    [-0.5, '−0.5%'],
    [-1.24, '−1.2%'],
  ])('%s points → %s', (points, text) => {
    expect(formatPercentPoints(points)).toBe(text);
  });

  it('turns a share of one into percent points', () => {
    expect(formatShare(0.6)).toBe('60%');
    expect(formatShare(0.15)).toBe('15%');
    expect(formatShare(0.25)).toBe('25%');
  });

  it('names a non-finite metric n/a', () => {
    expect(formatPercentPoints(Number.NaN)).toBe('n/a');
    expect(formatShare(Number.POSITIVE_INFINITY)).toBe('n/a');
  });
});
