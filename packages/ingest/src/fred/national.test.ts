import { describe, expect, it } from 'vitest';
import { NATIONAL_SERIES, parseNationalRates, type FredObservationsRaw } from './national';

function observation(date: string, value: string): string {
  return JSON.stringify({ observations: [{ date, value }] });
}

function raw(valueFor: (seriesId: string) => string, date = '2026-10-01'): FredObservationsRaw {
  return {
    retrievedAt: '2026-11-13T12:00:00.000Z',
    responses: NATIONAL_SERIES.map(([seriesId]) => ({
      seriesId,
      body: observation(date, valueFor(seriesId)),
    })),
  };
}

describe('FRED national rates', () => {
  it('turns the release percents into rates and keeps every series on one date', () => {
    const rows = parseNationalRates(raw(() => '0.38'));
    expect(rows).toHaveLength(11);
    expect(rows[0]).toEqual({
      seriesId: 'SNDR',
      label: 'Savings',
      date: '2026-10-01',
      rate: '0.0038',
    });
  });

  it('holds the batch when one observation is empty or the dates differ', () => {
    expect(parseNationalRates(raw((id) => (id === 'ICNDR' ? '.' : '0.07')))).toEqual([]);
    const mixed = raw(() => '0.38');
    const first = mixed.responses[0];
    if (first === undefined) throw new Error('expected a series');
    const shifted = {
      ...mixed,
      responses: [
        { ...first, body: observation('2026-09-01', '0.38') },
        ...mixed.responses.slice(1),
      ],
    };
    expect(parseNationalRates(shifted)).toEqual([]);
  });
});
