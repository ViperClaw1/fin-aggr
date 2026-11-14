import { rateFromPercent, type Rate } from '@fa/contracts';
import { Decimal } from 'decimal.js';
import { bodyHash } from '../content-hash';
import { fetchOfficial } from '../official-fetch';
import { type Source } from '../pipeline';
import { rateMoveExceeds } from '../rate-move';
import type { ValidationReport } from '../validate';

/** Daily Treasury Par Yield Curve CSV. Read 2026-11-12 from the interest-rate data center. */
const FEED =
  'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv';

/** Official pages name the project. This feed is not a bank scrape, so it has no mailbox. */
export const PAR_YIELD_USER_AGENT = 'FA (+https://fin-aggr.vercel.app)';

/** Connector cap. `Rate` itself allows up to 100%. */
const YIELD_MAX = '0.2';

const TENOR_COLUMNS = [
  ['1 Mo', '1M'],
  ['1.5 Month', '1.5M'],
  ['2 Mo', '2M'],
  ['3 Mo', '3M'],
  ['4 Mo', '4M'],
  ['6 Mo', '6M'],
  ['1 Yr', '1Y'],
  ['2 Yr', '2Y'],
  ['3 Yr', '3Y'],
  ['5 Yr', '5Y'],
  ['7 Yr', '7Y'],
  ['10 Yr', '10Y'],
  ['20 Yr', '20Y'],
  ['30 Yr', '30Y'],
] as const;

export const PAR_TENORS = TENOR_COLUMNS.map((column) => column[1]);

export type ParTenor = (typeof PAR_TENORS)[number];

export interface ParYieldPoint {
  date: string;
  tenor: ParTenor;
  rate: Rate;
}

export interface ParYieldRaw {
  retrievedAt: string;
  url: string;
  body: string;
}

const HEADER = ['Date', ...TENOR_COLUMNS.map((column) => column[0])];

/** The live file uses an empty `page` parameter. The year is the year of `retrievedAt`. */
export function parYieldUrl(year: number): string {
  const y = String(year);
  return `${FEED}/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`;
}

function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

/** The first row still has the par-curve columns. Bill-rate columns are a different feed. */
export function parYieldHeaderProblems(csv: string): string[] {
  const cells = splitCsv(csv.split(/\r?\n/, 1)[0] ?? '');
  if (cells.length !== HEADER.length || cells[0] !== 'Date') return ['header'];
  return HEADER.filter((label, index) => cells[index] !== label).map((label) => `column ${label}`);
}

/** Calendar check only. `Date.UTC` is not the job clock. */
function isoDate(cell: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cell.trim());
  if (match === null) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const same =
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
  if (!same) return null;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

function linesOf(csv: string): string[][] {
  if (parYieldHeaderProblems(csv).length > 0) throw new Error('treasury par yield header');
  return csv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map(splitCsv);
}

/** Pure. `N/A` and a blank cell omit that tenor; validate then refuses the date. */
export function parseParYields(raw: ParYieldRaw): ParYieldPoint[] {
  const points: ParYieldPoint[] = [];
  for (const cells of linesOf(raw.body)) {
    const date = isoDate(cells[0] ?? '');
    if (date === null) throw new Error('treasury par yield date');
    for (const [index, column] of TENOR_COLUMNS.entries()) {
      const cell = (cells[index + 1] ?? '').trim();
      if (cell === '' || cell.toUpperCase() === 'N/A') continue;
      points.push({ date, tenor: column[1], rate: rateFromPercent(cell) });
    }
  }
  return points;
}

function yieldOutOfBounds(rate: Rate): boolean {
  const value = new Decimal(rate);
  return value.lt(0) || value.gt(YIELD_MAX);
}

function rateOn(
  rows: readonly ParYieldPoint[],
  date: string | undefined,
  tenor: ParTenor,
): Rate | undefined {
  if (date === undefined) return undefined;
  return rows.find((row) => row.date === date && row.tenor === tenor)?.rate;
}

function newestDate(rows: readonly ParYieldPoint[]): string | undefined {
  return [...rows]
    .map((row) => row.date)
    .sort()
    .at(-1);
}

/**
 * 50bp is the newest curve against the stored print of that date, else the prior date in this
 * file, else the newest stored curve. A jump on an older day of the year file is not a flag.
 */
function latestMove(
  rows: readonly ParYieldPoint[],
  previous: readonly ParYieldPoint[],
): { key: string; reasons: string[] }[] {
  const latest = newestDate(rows);
  if (latest === undefined) return [];
  const prior = [...new Set(rows.map((row) => row.date))]
    .filter((date) => date !== latest)
    .sort()
    .at(-1);
  const stored = newestDate(previous);
  const flags: { key: string; reasons: string[] }[] = [];
  for (const tenor of PAR_TENORS) {
    const next = rateOn(rows, latest, tenor);
    const baseline =
      rateOn(previous, latest, tenor) ??
      rateOn(rows, prior, tenor) ??
      rateOn(previous, stored, tenor);
    if (next === undefined || baseline === undefined) continue;
    if (rateMoveExceeds(next, baseline)) {
      flags.push({ key: `${latest} ${tenor}`, reasons: ['rate move'] });
    }
  }
  return flags;
}

function missingTenor(rows: readonly ParYieldPoint[]): boolean {
  const dates = new Set(rows.map((row) => row.date));
  for (const date of dates) {
    for (const tenor of PAR_TENORS) {
      if (!rows.some((row) => row.date === date && row.tenor === tenor)) return true;
    }
  }
  return false;
}

/**
 * Every current CMT tenor, 0–20%, and no date after the fetch day.
 * The shrink gate only sees the newest stored curve (see `previousParYields`).
 */
export function validateParYields(
  rows: readonly ParYieldPoint[],
  previous: readonly ParYieldPoint[],
  asOf: string,
): ValidationReport<ParYieldPoint> {
  if (rows.some((row) => row.date > asOf)) return { clean: [], suspicious: [], blocked: 'future' };
  if (missingTenor(rows)) return { clean: [], suspicious: [], blocked: 'tenor' };
  if (rows.some((row) => yieldOutOfBounds(row.rate))) {
    return { clean: [], suspicious: [], blocked: 'rate bounds' };
  }
  const suspicious = latestMove(rows, previous);
  const moved = new Set(suspicious.map((flag) => flag.key));
  const clean = rows.filter((row) => !moved.has(`${row.date} ${row.tenor}`));
  return { clean, suspicious, blocked: null };
}

function snapshotOf(raw: ParYieldRaw): {
  sha256: string;
  bytes: Uint8Array;
  body: ParYieldRaw;
  requestCount: number;
} {
  return { ...bodyHash([raw.body]), body: raw, requestCount: 1 };
}

interface FetchInput {
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  retrievedAt: string;
}

export async function fetchParYields(input: FetchInput): Promise<{
  sha256: string;
  bytes: Uint8Array;
  body: ParYieldRaw;
  requestCount: number;
}> {
  const year = Number(input.retrievedAt.slice(0, 4));
  if (!Number.isInteger(year)) throw new Error('treasury par yield year');
  const url = parYieldUrl(year);
  const response = await fetchOfficial(input.fetchImpl, url, {
    signal: input.signal,
    headers: { accept: 'text/csv', 'user-agent': PAR_YIELD_USER_AGENT },
  });
  return snapshotOf({ retrievedAt: input.retrievedAt, url, body: await response.text() });
}

export function parYieldSource(now: () => string): Source<ParYieldRaw, ParYieldPoint> {
  let asOf = now().slice(0, 10);
  return {
    id: 'treasury-par-yield',
    domain: 'par_yields',
    kind: 'official_api',
    fetch: (ctx) => {
      const retrievedAt = now();
      asOf = retrievedAt.slice(0, 10);
      return fetchParYields({ fetchImpl: fetch, signal: ctx.signal, retrievedAt });
    },
    parse: parseParYields,
    validate: (rows, previous) => validateParYields(rows, previous, asOf),
  };
}
