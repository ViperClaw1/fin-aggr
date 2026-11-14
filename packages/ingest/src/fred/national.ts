import { rateFromPercent, type Rate } from '@fa/contracts';
import { Decimal } from 'decimal.js';
import { sha256Hex, type Source } from '../pipeline';
import { fetchOfficial } from '../official-fetch';
import type { ValidationReport } from '../validate';

/**
 * National Deposit Rates, FRED release 317, table eid 1217866.
 * Series ids read from that table on 2026-11-13. The table header says Percent.
 * Rate caps are a different table and are not stored.
 */
/** FRED series title, read from fred.stlouisfed.org/series/<id> on 2026-11-14. */
export const NATIONAL_SERIES = [
  ['SNDR', 'National Rate: Savings'],
  ['ICNDR', 'National Rate: Interest Checking'],
  ['MMNDR', 'National Rate: Money Market <100M'],
  ['NDR1MCD', 'National Rate: 1 Month CD <100M'],
  ['NDR3MCD', 'National Rate: 3 Month CD <100M'],
  ['NDR6MCD', 'National Rate: 6 Month CD <100M'],
  ['NDR12MCD', 'National Rate: 12 Month CD <100M'],
  ['NDR24MCD', 'National Rate: 24 Month CD <100M'],
  ['NDR36MCD', 'National Rate: 36 Month CD <100M'],
  ['NDR48MCD', 'National Rate: 48 Month CD <100M'],
  ['NDR60MCD', 'National Rate: 60 Month CD <100M'],
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
  responses: readonly { seriesId: string; body: string }[];
}

export interface NationalParse {
  rows: NationalRate[];
  problems: string[];
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
    limit: '3',
  });
  return `${ENDPOINT}?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface Point {
  date: string;
  value: string;
}

function pointFrom(value: unknown): Point | null {
  if (!isRecord(value)) return null;
  const date = value['date'];
  const amount = value['value'];
  if (typeof date !== 'string' || typeof amount !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { date, value: amount };
}

/** Up to three observations, newest first when FRED sorted descending. */
function pointsFrom(body: string): Point[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['observations'])) return [];
  const points: Point[] = [];
  for (const item of parsed['observations']) {
    if (points.length === 3) break;
    const point = pointFrom(item);
    if (point !== null) points.push(point);
  }
  return points;
}

function depositRate(percent: string): Rate | 'missing' | 'range' {
  if (percent.trim() === '' || percent.trim() === '.') return 'missing';
  try {
    const rate = rateFromPercent(percent);
    const value = new Decimal(rate);
    if (value.lt(0) || value.gt(RATE_MAX)) return 'range';
    return rate;
  } catch {
    return 'range';
  }
}

function pointsBySeries(
  responses: FredObservationsRaw['responses'],
): Map<NationalSeriesId, Point[]> {
  const byId = new Map<NationalSeriesId, Point[]>();
  for (const response of responses) {
    if (!isNationalSeriesId(response.seriesId) || byId.has(response.seriesId)) continue;
    byId.set(response.seriesId, pointsFrom(response.body));
  }
  return byId;
}

function unknownSeries(responses: FredObservationsRaw['responses']): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const response of responses) {
    if (isNationalSeriesId(response.seriesId) || seen.has(response.seriesId)) continue;
    seen.add(response.seriesId);
    problems.push(`fred_series_missing:${response.seriesId}`);
  }
  return problems;
}

/** Latest date shared by the most series. A one-month lag still meets the other ten. */
function anchorDate(byId: ReadonlyMap<NationalSeriesId, Point[]>): string | null {
  const counts = new Map<string, number>();
  for (const [id] of NATIONAL_SERIES) {
    for (const date of new Set((byId.get(id) ?? []).map((point) => point.date))) {
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }
  let best: { date: string; count: number } | null = null;
  for (const [date, count] of counts) {
    if (best === null || count > best.count || (count === best.count && date > best.date)) {
      best = { date, count };
    }
  }
  return best?.date ?? null;
}

function seriesProblem(
  id: NationalSeriesId,
  points: readonly Point[],
  anchor: string | null,
): string | null {
  if (points.length === 0) return `fred_series_missing:${id}`;
  const point = anchor === null ? undefined : points.find((item) => item.date === anchor);
  if (point === undefined) return `date_mismatch:${id}`;
  const rate = depositRate(point.value);
  if (rate === 'missing') return `value_missing:${id}`;
  if (rate === 'range') return `out_of_range:${id}`;
  return null;
}

function rowsOn(byId: ReadonlyMap<NationalSeriesId, Point[]>, anchor: string): NationalRate[] {
  const rows: NationalRate[] = [];
  for (const [id, label] of NATIONAL_SERIES) {
    const point = (byId.get(id) ?? []).find((item) => item.date === anchor);
    const rate = point === undefined ? 'missing' : depositRate(point.value);
    if (rate === 'missing' || rate === 'range') return [];
    rows.push({ seriesId: id, label, date: anchor, rate });
  }
  return rows;
}

export function parseNationalRates(raw: FredObservationsRaw): NationalParse {
  const byId = pointsBySeries(raw.responses);
  const anchor = anchorDate(byId);
  const problems = [
    ...NATIONAL_SERIES.flatMap(([id]) => {
      const problem = seriesProblem(id, byId.get(id) ?? [], anchor);
      return problem === null ? [] : [problem];
    }),
    ...unknownSeries(raw.responses),
  ];
  if (problems.length > 0 || anchor === null) return { rows: [], problems };
  return { rows: rowsOn(byId, anchor), problems: [] };
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
  const observation = pointsFrom(body)[0];
  if (observation === undefined) return ['observations'];
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
  const responses: { seriesId: string; body: string }[] = [];
  for (const [seriesId] of NATIONAL_SERIES) {
    const response = await fetchOfficial(input.fetchImpl, observationsUrl(seriesId, key), {
      signal: input.requestSignal(),
      headers: { accept: 'application/json', 'user-agent': FRED_USER_AGENT },
    });
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
  let problems: readonly string[] = [];
  return {
    id: 'fdic-national-rates',
    domain: 'national_rates',
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
    parse: (raw) => {
      const parsed = parseNationalRates(raw);
      problems = parsed.problems;
      return parsed.rows;
    },
    validate: (rows) => {
      if (problems.length > 0) return { clean: [], suspicious: [], blocked: problems.join('; ') };
      return validateNationalRates(rows, asOf);
    },
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
