import { MoneyParseError, rateFromPercent, type Rate } from '@fa/contracts';

/**
 * American Express National Bank public rate JSON (ADR-020).
 * `apy` is taken from `String(apy)` and then `rateFromPercent`. No float arithmetic.
 * Minimum, tiers, penalty, and eligibility are not in this payload and are not guessed.
 */

const AMEX_INSTITUTION_ID = 'fdic:27471';
export const AMEX_SOURCE_ID = 'bank:fdic:27471';
export const AMEX_RATES_URL = 'https://functions.americanexpress.com/ReadBankingInterestRates.v1';
export const AMEX_TIME_ZONE = 'America/Denver';

const APY_TEXT = /^\d+(\.\d{1,6})?$/;
const TERM = /^(\d{1,3})M$/;
const IRA_TYPE = /^37\d{2}$/;
const DAY_MS = 86_400_000;
const STALE_AFTER_DAYS = 180;

const AMEX_HELD_FIELDS = ['min_opening', 'tiers', 'early_withdrawal', 'eligibility'] as const;

export interface AmexOffer {
  institutionId: typeof AMEX_INSTITUTION_ID;
  productId: string;
  category: 'cd' | 'savings';
  termMonths: number | null;
  apy: Rate;
  bankType: string;
  description: string;
  asOf: string;
}

interface AmexSkipped {
  bankType: string;
  reason: 'not_offered';
}

interface AmexExcluded {
  bankType: string;
  description: string;
  reason: 'ira';
}

interface AmexReview {
  bankType: string;
  reason: string;
}

export type AmexParsed =
  | { kind: 'broken' }
  | {
      kind: 'rows';
      offers: readonly AmexOffer[];
      skipped: readonly AmexSkipped[];
      excluded: readonly AmexExcluded[];
      review: readonly AmexReview[];
    };

interface Fields {
  term: string | null;
  rate: string;
  apy: number;
  type: string;
  rateCode: string;
  description: string;
  effectiveDate: string;
}

type RowOutcome =
  | { kind: 'offer'; offer: AmexOffer }
  | { kind: 'skip'; row: AmexSkipped }
  | { kind: 'exclude'; row: AmexExcluded }
  | { kind: 'review'; row: AmexReview };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function utcMidnight(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`);
}

function monthCount(digits: string): number | null {
  if (!/^[1-9]\d{0,2}$/.test(digits)) return null;
  let value = 0;
  for (const ch of digits) value = value * 10 + (ch.charCodeAt(0) - 48);
  return value;
}

function requiredText(
  row: Record<string, unknown>,
): Pick<Fields, 'rate' | 'rateCode' | 'type' | 'description' | 'effectiveDate'> | null {
  const rate = row['rate'];
  const rateCode = row['rateCode'];
  const type = row['type'];
  const description = row['description'];
  const effectiveDate = row['effectiveDate'];
  if (typeof rate !== 'string' || typeof rateCode !== 'string' || typeof type !== 'string') {
    return null;
  }
  if (typeof description !== 'string' || typeof effectiveDate !== 'string') return null;
  if (!/^\d+$/.test(type) || description.trim() === '') return null;
  return { rate, rateCode, type, description: description.trim(), effectiveDate };
}

function readRow(row: unknown): Fields | null {
  if (!isRecord(row)) return null;
  const text = requiredText(row);
  if (text === null) return null;
  const apy = row['apy'];
  if (typeof apy !== 'number' || !Number.isFinite(apy)) return null;
  const term = row['term'];
  if (typeof term === 'string') return { ...text, apy, term };
  if (term !== undefined) return null;
  return { ...text, apy, term: null };
}

function isIra(fields: Fields): boolean {
  return IRA_TYPE.test(fields.type) || fields.description.startsWith('IRA');
}

function categoryOf(rateCode: string): 'cd' | 'savings' | null {
  if (rateCode === 'CD') return 'cd';
  if (rateCode === 'SAV') return 'savings';
  return null;
}

function termOf(category: 'cd' | 'savings', term: string | null): number | null | 'bad' {
  if (category === 'savings') return null;
  if (term === null) return 'bad';
  const match = TERM.exec(term);
  if (match === null) return 'bad';
  return monthCount(match[1] ?? '') ?? 'bad';
}

/** `String(apy)` must be a short decimal. The point then moves in `rateFromPercent`. */
function apyOf(apy: number): { kind: 'rate'; rate: Rate } | { kind: 'bad'; text: string } {
  const text = String(apy);
  if (!APY_TEXT.test(text)) return { kind: 'bad', text };
  try {
    return { kind: 'rate', rate: rateFromPercent(text) };
  } catch (error) {
    if (error instanceof MoneyParseError) return { kind: 'bad', text };
    throw error;
  }
}

function dateOf(
  effectiveDate: string,
  retrievedDay: string,
): { kind: 'ok'; asOf: string } | { kind: 'bad'; reason: string } {
  if (!isIsoDate(effectiveDate)) return { kind: 'bad', reason: 'asof_invalid' };
  const age = utcMidnight(retrievedDay) - utcMidnight(effectiveDate);
  if (age < 0) return { kind: 'bad', reason: 'asof_future' };
  if (age > STALE_AFTER_DAYS * DAY_MS) return { kind: 'bad', reason: 'stale' };
  return { kind: 'ok', asOf: effectiveDate };
}

function outcome(row: unknown, retrievedDay: string): RowOutcome {
  const fields = readRow(row);
  if (fields === null) return { kind: 'review', row: { bankType: '', reason: 'row_shape' } };
  if (isIra(fields)) {
    return {
      kind: 'exclude',
      row: { bankType: fields.type, description: fields.description, reason: 'ira' },
    };
  }
  if (fields.apy === 0 || fields.rate === '0.0') {
    return { kind: 'skip', row: { bankType: fields.type, reason: 'not_offered' } };
  }
  const category = categoryOf(fields.rateCode);
  if (category === null) {
    return {
      kind: 'review',
      row: { bankType: fields.type, reason: `rate_code:${fields.rateCode}` },
    };
  }
  const termMonths = termOf(category, fields.term);
  if (termMonths === 'bad')
    return { kind: 'review', row: { bankType: fields.type, reason: 'term' } };
  const apy = apyOf(fields.apy);
  if (apy.kind === 'bad') {
    return { kind: 'review', row: { bankType: fields.type, reason: `apy_format:${apy.text}` } };
  }
  const dated = dateOf(fields.effectiveDate, retrievedDay);
  if (dated.kind === 'bad') {
    return { kind: 'review', row: { bankType: fields.type, reason: dated.reason } };
  }
  return {
    kind: 'offer',
    offer: {
      institutionId: AMEX_INSTITUTION_ID,
      productId: `${AMEX_INSTITUTION_ID}:${fields.type}`,
      category,
      termMonths,
      apy: apy.rate,
      bankType: fields.type,
      description: fields.description,
      asOf: dated.asOf,
    },
  };
}

function collect(
  rows: readonly unknown[],
  retrievedDay: string,
): Exclude<AmexParsed, { kind: 'broken' }> {
  const offers: AmexOffer[] = [];
  const skipped: AmexSkipped[] = [];
  const excluded: AmexExcluded[] = [];
  const review: AmexReview[] = [];
  for (const row of rows) {
    const next = outcome(row, retrievedDay);
    if (next.kind === 'offer') offers.push(next.offer);
    else if (next.kind === 'skip') skipped.push(next.row);
    else if (next.kind === 'exclude') excluded.push(next.row);
    else review.push(next.row);
  }
  return { kind: 'rows', offers, skipped, excluded, review };
}

/** Pure parse. `retrievedAt` is the fetch time and is not copied into `asOf`. */
export function parseAmexRates(body: string, retrievedAt: string): AmexParsed {
  const retrievedDay = retrievedAt.slice(0, 10);
  if (!isIsoDate(retrievedDay)) return { kind: 'broken' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return { kind: 'broken' };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['interestRateList'])) return { kind: 'broken' };
  return collect(parsed['interestRateList'], retrievedDay);
}

/** The JSON has no product fields a person has to confirm, so nothing is published. */
export function publishAmexProducts(): never {
  throw new Error(
    `amex products stay unpublished until ${AMEX_HELD_FIELDS.join(', ')} are confirmed from the disclosures`,
  );
}
