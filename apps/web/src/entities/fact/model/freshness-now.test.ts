import { asIsoDate, DATASET_DOMAINS, type DatasetInfo } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { freshnessNow } from './freshness-now';

function info(mockAsOf: string, realAsOf: string, real: boolean): DatasetInfo {
  const domains = Object.fromEntries(
    DATASET_DOMAINS.map((domain) => [
      domain,
      domain === 'products'
        ? { asOf: asIsoDate(real ? realAsOf : mockAsOf), isMock: !real }
        : { asOf: asIsoDate(mockAsOf), isMock: true },
    ]),
  ) as DatasetInfo['domains'];
  return {
    asOf: asIsoDate(real ? realAsOf : mockAsOf),
    isMock: !real,
    domains,
  };
}

describe('freshnessNow', () => {
  const clock = () => new Date('2027-01-01T00:00:00Z');
  it('mock data counts from the data set date, not the clock', () => {
    expect(freshnessNow(info('2026-09-30', '2026-09-30', false), clock).toISOString()).toBe(
      '2026-09-30T00:00:00.000Z',
    );
  });
  it('real data counts from the clock', () => {
    expect(freshnessNow(info('2026-09-30', '2026-11-01', true), clock)).toEqual(clock());
  });
  it('a mock fact uses its domain date while a real fact uses the clock', () => {
    const dataset = info('2026-09-30', '2026-11-01', true);
    expect(freshnessNow(dataset, clock, { isMock: true, domain: 'documents' }).toISOString()).toBe(
      '2026-09-30T00:00:00.000Z',
    );
    expect(freshnessNow(dataset, clock, { isMock: false, domain: 'products' })).toEqual(clock());
  });
});
