import { asIsoDate } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { freshnessNow } from './freshness-now';

describe('freshnessNow', () => {
  const asOf = asIsoDate('2026-09-30');
  const clock = () => new Date('2027-01-01T00:00:00Z');
  it('mock data counts from the data set date, not the clock', () => {
    expect(freshnessNow({ asOf, isMock: true }, clock).toISOString()).toBe(
      '2026-09-30T00:00:00.000Z',
    );
  });
  it('real data counts from the clock', () => {
    expect(freshnessNow({ asOf, isMock: false }, clock)).toEqual(clock());
  });
});
