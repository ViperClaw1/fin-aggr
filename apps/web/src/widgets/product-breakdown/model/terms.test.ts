import { Cents, parseRate, type EarlyWithdrawal } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { openingText, penaltyText, TAX_TREATMENT_LABEL, termText, tierRange } from './terms';

const days = { kind: 'days_of_interest', days: 90 } as const satisfies EarlyWithdrawal;

describe('product terms', () => {
  it('names a penalty, an open tier and a minimum in words', () => {
    expect(penaltyText({ kind: 'none' })).toBe('None');
    expect(penaltyText(days)).toBe('90 days of interest');
    expect(penaltyText({ kind: 'months_of_interest', months: 3 })).toBe('3 months of interest');
    expect(penaltyText({ kind: 'percent_of_principal', rate: parseRate('0.01') })).toBe(
      '1% of the principal',
    );
    expect(
      tierRange({
        minBalance: Cents.parse(0),
        maxBalance: Cents.parse(1000000),
        apy: parseRate('0.04'),
      }),
    ).toBe('$0 to $10,000');
    expect(
      tierRange({ minBalance: Cents.parse(1000000), maxBalance: null, apy: parseRate('0.05') }),
    ).toBe('$10,000 and up');
    expect(openingText(Cents.parse(0))).toBe('No minimum');
    expect(openingText(Cents.parse(50000))).toBe('$500');
    expect(termText(null)).toBe('No term');
    expect(termText(12)).toBe('12 months');
    expect(TAX_TREATMENT_LABEL.federal_exempt).toBe('Exempt from federal income tax');
  });
});
