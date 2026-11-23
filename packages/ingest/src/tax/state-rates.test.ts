import { describe, expect, it } from 'vitest';
import { STATE_RATES_PENDING, stateRate, stateRates2026 } from './state-rates';

describe('stateRates2026', () => {
  const drafts = stateRates2026();

  it('takes every flat and top rate from its quote, not from a typed number', () => {
    for (const d of drafts.filter((x) => x.kind !== 'none')) {
      const pattern = new RegExp(`\\b${d.percent.replace('.', '\\.')}( ?%| percent)`);
      expect(`${d.state}: ${String(pattern.test(d.quote))}`).toBe(`${d.state}: true`);
    }
  });

  const rateOf = (state: string): string | undefined => {
    const draft = drafts.find((d) => d.state === state);
    return draft === undefined ? undefined : stateRate(draft);
  };

  it('gives a no-tax state a zero rate', () => {
    expect(rateOf('TX')).toBe('0');
  });

  it('turns a flat percent into a fraction', () => {
    expect(rateOf('NC')).toBe('0.0399');
  });

  it('lists each state once', () => {
    const codes = drafts.map((d) => d.state);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('accounts for all 50 states and DC between drafts and pending', () => {
    expect(drafts.length + STATE_RATES_PENDING.length).toBe(51);
  });

  it('keeps pending states out of the drafts', () => {
    const codes = drafts.map((d) => d.state);
    expect(codes.filter((c) => (STATE_RATES_PENDING as readonly string[]).includes(c))).toEqual([]);
  });
});
