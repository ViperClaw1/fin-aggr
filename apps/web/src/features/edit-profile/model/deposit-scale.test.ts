import { describe, expect, it } from 'vitest';
import { centsFromDepositSlider, depositSliderFromCents } from './deposit-scale';

describe('deposit slider', () => {
  it('maps the ends to $500 and $250,000', () => {
    expect(centsFromDepositSlider(0)).toBe(50_000);
    expect(centsFromDepositSlider(1000)).toBe(25_000_000);
  });

  it('lands back on the same thumb after a snap to $500', () => {
    const cents = centsFromDepositSlider(400);
    expect(cents % 50_000).toBe(0);
    const again = centsFromDepositSlider(depositSliderFromCents(cents));
    expect(again).toBe(cents);
  });
});
