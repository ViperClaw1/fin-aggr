import { rateFromPercent, type Rate } from '@fa/contracts';
import { Decimal } from 'decimal.js';
import { sha256Hex, type Source } from '../pipeline';
import type { ValidationReport } from '../validate';

/**
 * National Deposit Rates, FRED release 317, table eid 1217866.
 * Series ids read from that table on 2026-11-13. The table header says Percent.
 * Rate caps are a different table and are not stored.
 */
export const NATIONAL_SERIES = [
  ['SNDR', 'Savings'],
  ['ICNDR', 'Interest Checking'],
  ['MMNDR', 'Money Market'],
  ['NDR1MCD', '1-Month CD'],
  ['NDR3MCD', '3-Month CD'],
  ['NDR6MCD', '6-Month CD'],
  ['NDR12MCD', '12-Month CD'],
  ['NDR24MCD', '24-Month CD'],
  ['NDR36MCD', '36-Month CD'],
  ['NDR48MCD', '48-Month CD'],
  ['NDR60MCD', '60-Month CD'],
] as const;

export type NationalSeriesId = (typeof NATIONAL_SERIES)[number][0];

const SERIES_IDS = new Set<string>(NATIONAL_SERIES.map(([id]) => id));

export function isNationalSeriesId(value: string): value is NationalSeriesId {
  return SERIES_IDS.has(value);
}

export interface NationalRate {
  seriesId: NationalSeriesId;
  label: string;
  date: string;
  rate: Rate;
}

export interface FredObservationsRaw {
  retrievedAt: string;
  responses: readonly { seriesId: NationalSeriesId; body: string }[];
}

const ENDPOINT = 'https://api.stlouisfed.org/fred/series/observations';
const RATE_MAX = '0.2';

const FRED_USER_AGENT = 'FA (+https://fin-aggr.vercel.app)';

function observationsUrl(seriesId: string, apiKey: string): string {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'desc',
    limit: '1',
  });
  return `${ENDPOINT}?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function observationFields(value: unknown): { date: string; value: string } | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first: unknown = value[0];
  if (!isRecord(first)) return null;
  const date = first['date'];
  const amount = first['value'];
  if (typeof date !== 'string' || typeof amount !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { date, value: amount };
}

function latestObservation(body: string): { date: string; value: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  return observationFields(parsed['observations']);
}

function depositRate(percent: string): Rate | null {
  if (percent.trim() === '' || percent.trim() === '.') return null;
  try {
    const rate = rateFromPercent(percent);
    const value = new Decimal(rate);
    if (value.lt(0) || value.gt(RATE_MAX)) return null;
    return rate;
  } catch {
    return null;
  }
}

export function parseNationalRates(raw: FredObservationsRaw): NationalRate[] {
  const rows: NationalRate[] = [];
  let date: string | null = null;
  for (const response of raw.responses) {
    const label = NATIONAL_SERIES.find(([id]) => id === response.seriesId)?.[1];
    if (label === undefined) throw new Error('fred series');
    const observation = latestObservation(response.body);
    if (observation === null) return [];
    date ??= observation.date;
    if (observation.date !== date) return [];
    const rate = depositRate(observation.value);
    if (rate === null) return [];
    rows.push({ seriesId: response.seriesId, label, date: observation.date, rate });
  }
  if (rows.length !== NATIONAL_SERIES.length) return [];
  return rows;
}

function validateNationalRates(
  rows: readonly NationalRate[],
  asOf: string,
): ValidationReport<NationalRate> {
  if (rows.length !== NATIONAL_SERIES.length)
    return { clean: [], suspicious: [], blocked: 'empty' };
  if (rows.some((row) => row.date > asOf)) return { clean: [], suspicious: [], blocked: 'future' };
  return { clean: rows, suspicious: [], blocked: null };
}

function nationalRatesShapeProblems(body: string): string[] {
  const observation = (() => {
    try {
      return latestObservation(body);
    } catch {
      return null;
    }
  })();
  if (observation === null) return ['observations'];
  if (observation.value.trim() === '') return ['value'];
  return [];
}

async function fetchNationalRates(input: {
  fetchImpl: typeof fetch;
  requestSignal: () => AbortSignal;
  retrievedAt: string;
  apiKey: string;
}): Promise<{
  sha256: string;
  bytes: Uint8Array;
  body: FredObservationsRaw;
  requestCount: number;
}> {
  const key = input.apiKey.trim();
  if (key === '') throw new Error('FRED_API_KEY is missing');
  const responses: { seriesId: NationalSeriesId; body: string }[] = [];
  for (const [seriesId] of NATIONAL_SERIES) {
    const response = await input.fetchImpl(observationsUrl(seriesId, key), {
      signal: input.requestSignal(),
      headers: { accept: 'application/json', 'user-agent': FRED_USER_AGENT },
    });
    if (!response.ok) throw new Error(`fred http ${String(response.status)}`);
    responses.push({ seriesId, body: await response.text() });
  }
  const bytes = new TextEncoder().encode(
    JSON.stringify(responses.map((response) => response.body)),
  );
  return {
    sha256: sha256Hex(bytes),
    bytes,
    body: { retrievedAt: input.retrievedAt, responses },
    requestCount: responses.length,
  };
}

export function nationalRatesSource(
  now: () => string,
  apiKey: string,
): Source<FredObservationsRaw, NationalRate> {
  let asOf = now().slice(0, 10);
  return {
    id: 'fdic-national-rates',
    domain: 'reference',
    kind: 'official_api',
    requestTimeoutMs: 30_000,
    fetchBudgetMs: 180_000,
    fetch: (ctx) => {
      const retrievedAt = now();
      asOf = retrievedAt.slice(0, 10);
      return fetchNationalRates({
        fetchImpl: fetch,
        requestSignal: () => ctx.requestSignal(),
        retrievedAt,
        apiKey,
      });
    },
    parse: parseNationalRates,
    validate: (rows) => validateNationalRates(rows, asOf),
  };
}

/** One series, so a format change fails before the weekly pull. The value is not printed. */
export async function checkNationalRatesShape(
  fetchImpl: typeof fetch,
  apiKey: string,
): Promise<string> {
  if (apiKey.trim() === '') return 'fdic national rates shape key';
  const response = await fetchImpl(observationsUrl('SNDR', apiKey.trim()), {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'application/json', 'user-agent': FRED_USER_AGENT },
  });
  if (!response.ok) return `fdic national rates shape http ${String(response.status)}`;
  const problems = nationalRatesShapeProblems(await response.text());
  if (problems.length > 0) return `fdic national rates shape ${problems.join(' ')}`;
  return 'fdic national rates shape ok';
}
