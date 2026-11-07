import { describe, expect, it } from 'vitest';
import { roundPercentText } from './percent-display';

describe('roundPercentText', () => {
  it('rounds half-up to two decimals and pads short values', () => {
    expect(roundPercentText('3.305%')).toBe('3.31%');
    expect(roundPercentText('3.304%')).toBe('3.30%');
    expect(roundPercentText('4%')).toBe('4.00%');
    expect(roundPercentText('−1.995%')).toBe('−2.00%');
  });
});
