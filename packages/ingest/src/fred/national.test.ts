import { describe, expect, it } from 'vitest';
import {
  NATIONAL_SERIES,
  nationalRatesSource,
  parseNationalRates,
  type FredObservationsRaw,
} from './national';

function observation(points: readonly { date: string; value: string }[]): string {
  return JSON.stringify({ observations: points });
}

function raw(valueFor: (seriesId: string) => string, date = '2026-10-01'): FredObservationsRaw {
  return {
    retrievedAt: '2026-11-13T12:00:00.000Z',
    responses: NATIONAL_SERIES.map(([seriesId]) => ({
      seriesId,
      body: observation([{ date, value: valueFor(seriesId) }]),
    })),
  };
}

describe('FRED national rates', () => {
  it('turns the release percents into rates and keeps every series on one date', () => {
    const parsed = parseNationalRates(raw(() => '0.38'));
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(11);
    expect(parsed.rows[0]).toEqual({
      seriesId: 'SNDR',
      label: 'National Rate: Savings',
      date: '2026-10-01',
      rate: '0.0038',
    });
  });

  it('uses the latest date shared by all 11 series when one series is a month behind', () => {
    const behind = raw(() => '0.38', '2026-10-01');
    const first = behind.responses[0];
    if (first === undefined) throw new Error('expected a series');
    const parsed = parseNationalRates({
      ...behind,
      responses: [
        {
          seriesId: first.seriesId,
          body: observation([
            { date: '2026-09-01', value: '0.37' },
            { date: '2026-08-01', value: '0.36' },
            { date: '2026-07-01', value: '0.35' },
          ]),
        },
        ...behind.responses.slice(1).map((response) => ({
          seriesId: response.seriesId,
          body: observation([
            { date: '2026-10-01', value: '0.38' },
            { date: '2026-09-01', value: '0.37' },
            { date: '2026-08-01', value: '0.36' },
          ]),
        })),
      ],
    });
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(11);
    expect(parsed.rows.every((row) => row.date === '2026-09-01')).toBe(true);
  });

  it('names a wrong series id and puts that list on the review reason', () => {
    const body = raw(() => '0.38');
    const parsed = parseNationalRates({
      ...body,
      responses: [{ seriesId: 'NOPE', body: observation([{ date: '2026-10-01', value: '0.38' }]) }],
    });
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems).toContain('fred_series_missing:NOPE');
    const source = nationalRatesSource(() => '2026-11-14T00:00:00.000Z', 'test-key');
    const rows = source.parse({
      ...body,
      responses: [{ seriesId: 'NOPE', body: observation([{ date: '2026-10-01', value: '0.38' }]) }],
    });
    expect(source.validate(rows, []).blocked).toContain('fred_series_missing:NOPE');
  });

  it('names a blank value and a rate outside the band', () => {
    expect(parseNationalRates(raw((id) => (id === 'ICNDR' ? '.' : '0.07'))).problems).toContain(
      'value_missing:ICNDR',
    );
    expect(parseNationalRates(raw((id) => (id === 'MMNDR' ? '25' : '0.07'))).problems).toContain(
      'out_of_range:MMNDR',
    );
  });
});
