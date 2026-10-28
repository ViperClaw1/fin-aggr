// Shared helpers: fixed dates (no clock, ADR-011), mock provenance, money and rate builders.
import {
  IsoDate,
  IsoDateTime,
  parseCents,
  rateFromPercent,
  type Cents,
  type Provenance,
  type Rate,
} from '@fa/contracts';

export const AS_OF = IsoDate.parse('2026-09-30');
/** Default retrieval time: the data set date, never after it (ADR-016 D6). */
export const RETRIEVED_AT = IsoDateTime.parse(`${AS_OF}T00:00:00Z`);
export const VALID_FROM = IsoDate.parse('2026-10-01');

export const STATE_CODES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'DC',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
] as const;

/** Page of every synthetic document that states the early withdrawal penalty. */
export const PENALTY_PAGE = 2;

export interface DocumentRef {
  id: string;
  page: number;
  quote: string;
}

const DAY_MS = 86_400_000;

/** Midnight UTC `days` before `date` (fixed dates only, never the clock). */
export function daysBefore(date: IsoDate, days: number): IsoDateTime {
  const ms = Date.parse(`${date}T00:00:00Z`) - days * DAY_MS;
  return IsoDateTime.parse(`${new Date(ms).toISOString().slice(0, 19)}Z`);
}

/** Provenance of synthetic data: always isMock, never verified. */
export function mockProvenance(
  sourceId: string,
  document?: DocumentRef,
  retrievedAt: IsoDateTime = RETRIEVED_AT,
): Provenance {
  return {
    sourceId,
    sourceUrl: `https://example.com/sources/${sourceId}`,
    retrievedAt,
    ...(document === undefined ? {} : { document }),
    verification: { status: 'unverified' },
    isMock: true,
  };
}

/** Whole dollars → Cents through the string parser: no multiplication of money by a number. */
export const dollars = (amount: number): Cents => parseCents(String(amount));

/** Basis points → Rate via the decimal string ("435" bp → "4.35" % → "0.0435"). */
export function bps(points: number): Rate {
  const digits = String(points).padStart(3, '0');
  return rateFromPercent(`${digits.slice(0, -2)}.${digits.slice(-2)}`);
}
