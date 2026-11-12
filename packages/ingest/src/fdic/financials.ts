import {
  BankMetrics,
  METRIC_KEYS,
  type BankMetrics as Report,
  type MetricKey,
} from '@fa/contracts';
import { Decimal } from 'decimal.js';
import { FINANCIAL_BOUNDS } from '../policy';
import type { ValidationReport } from '../validate';
import { mean, median, percentPoints, percentile } from './financials-market';

/** `GET /financials` on server `/banks`. Field codes from risview_properties.yaml, read 2026-11-12. */
const ENDPOINT = 'https://api.fdic.gov/banks/financials';
const FIELDS = 'CERT,REPDTE,ASSET,DEP,RBC1AAJ,RBCRWAJ,LNATRESR,LNLSDEPR,NCLNLSR,ROA';

const RATIO_FIELDS = {
  tier1LeverageRatio: 'RBC1AAJ',
  totalRiskBasedCapitalRatio: 'RBCRWAJ',
  allowanceToLoans: 'LNATRESR',
  loansToDeposits: 'LNLSDEPR',
  noncurrentLoansRatio: 'NCLNLSR',
  returnOnAssets: 'ROA',
} as const satisfies Record<Exclude<MetricKey, 'liquidAssetsToAssets'>, string>;

export interface FdicFinancialsRaw {
  retrievedAt: string;
  responses: readonly { url: string; body: string }[];
}

export interface CallReport {
  report: Report;
  depositsUsdThousands: number;
}

function digitsToInt(digits: string): number {
  let value = 0;
  for (const char of digits) value = value * 10 + (char.charCodeAt(0) - 48);
  return value;
}

/** One certificate, one field. The newest quarter is the first row, not a scan of the index. */
export function financialsProbeUrl(): string {
  const params = new URLSearchParams({
    fields: 'REPDTE',
    filters: 'CERT:3510',
    sort_by: 'REPDTE',
    sort_order: 'DESC',
    limit: '1',
    offset: '0',
  });
  return `${ENDPOINT}?${params.toString()}`;
}

export function financialsShapeUrl(): string {
  const params = new URLSearchParams({
    fields: FIELDS,
    filters: 'CERT:3510',
    sort_by: 'REPDTE',
    sort_order: 'DESC',
    limit: '1',
    offset: '0',
  });
  return `${ENDPOINT}?${params.toString()}`;
}

export function financialsUrl(reportDate: string, offset: number, pageSize: number): string {
  const params = new URLSearchParams({
    fields: FIELDS,
    filters: `REPDTE:${reportDate}`,
    sort_by: 'CERT',
    sort_order: 'ASC',
    limit: String(pageSize),
    offset: String(offset),
  });
  return `${ENDPOINT}?${params.toString()}`;
}

export function quoted(objectText: string, key: string): string | null {
  const match = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`).exec(objectText);
  return match?.[1] ?? null;
}

function numberLiteral(objectText: string, key: string): string | null {
  const match = new RegExp(`"${key}"\\s*:\\s*(null|-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)`).exec(
    objectText,
  );
  if (match?.[1] === undefined || match[1] === 'null') return null;
  return match[1];
}

export function innerObjects(body: string): string[] {
  const objects: string[] = [];
  for (const match of body.matchAll(/"data"\s*:\s*\{/g)) {
    const open = match.index + match[0].length - 1;
    const close = body.indexOf('}', open);
    if (close < 0) throw new Error('fdic financials object');
    objects.push(body.slice(open, close + 1));
  }
  return objects;
}

export function metaTotal(body: string): number {
  const match = /"total"\s*:\s*(\d+)/.exec(body);
  if (match?.[1] === undefined) throw new Error('fdic financials missing total');
  return digitsToInt(match[1]);
}

/** The first row still has the call-report fields. Values are not logged. */
export function financialFieldProblems(body: string): string[] {
  const first = innerObjects(body)[0];
  if (first === undefined) return ['data'];
  return ['CERT', 'REPDTE', 'ASSET', 'DEP', ...Object.values(RATIO_FIELDS)].filter(
    (key) => quoted(first, key) === null && numberLiteral(first, key) === null,
  );
}

export function reportDate(compact: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(compact);
  if (match === null) return null;
  const year = digitsToInt(match[1] ?? '');
  const month = digitsToInt(match[2] ?? '');
  const day = digitsToInt(match[3] ?? '');
  const utc = new Date(Date.UTC(year, month - 1, day));
  const same =
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
  return same ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function thousands(literal: string | null, label: string): number {
  if (literal === null || !/^\d+$/.test(literal)) throw new Error(`fdic financials ${label}`);
  if (literal.length > 15) throw new Error(`fdic financials ${label}`);
  return digitsToInt(literal);
}

function oneReport(
  objectText: string,
  sourceUrl: string,
  retrievedAt: string,
  quarter: string,
): CallReport | null {
  const cert = numberLiteral(objectText, 'CERT');
  if (cert === null || !/^\d+$/.test(cert)) throw new Error('fdic financials cert');
  const compact = quoted(objectText, 'REPDTE');
  const asOf = compact === null ? null : reportDate(compact);
  if (asOf === null) throw new Error('fdic financials date');
  if (asOf !== quarter) throw new Error('fdic financials mixed quarter');
  const assets = numberLiteral(objectText, 'ASSET');
  const deposits = numberLiteral(objectText, 'DEP');
  if (assets === null || deposits === null) return null;
  const provenance = {
    sourceId: 'fdic-financials',
    sourceUrl,
    retrievedAt,
    verification: { status: 'verified' as const, verifiedAt: asOf, by: 'official_api' as const },
    isMock: false,
  };
  const metrics: Record<string, unknown> = {};
  for (const key of METRIC_KEYS) {
    if (key === 'liquidAssetsToAssets') continue;
    const literal = numberLiteral(objectText, RATIO_FIELDS[key]);
    if (literal === null) continue;
    const points = new Decimal(literal).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    metrics[key] = {
      value: { value: points.toNumber(), marketMedian: 0, marketMean: 0, percentile: 0 },
      provenance,
    };
  }
  const report = BankMetrics.parse({
    institutionId: `fdic:${cert}`,
    asOf,
    totalAssetsUsdThousands: thousands(assets, 'assets'),
    metrics,
    balanceSheetMix: [],
    provenance,
  });
  return { report, depositsUsdThousands: thousands(deposits, 'deposits') };
}

function withMarket(rows: readonly CallReport[]): CallReport[] {
  const byKey = new Map<MetricKey, Decimal[]>();
  for (const key of METRIC_KEYS) {
    if (key === 'liquidAssetsToAssets') continue;
    byKey.set(
      key,
      rows.flatMap((row) => {
        const fact = row.report.metrics[key];
        return fact === undefined ? [] : [new Decimal(fact.value.value)];
      }),
    );
  }
  return rows.map((row) => ({
    ...row,
    report: {
      ...row.report,
      metrics: Object.fromEntries(
        METRIC_KEYS.flatMap((key) => {
          const fact = row.report.metrics[key];
          const sample = byKey.get(key);
          if (fact === undefined || sample === undefined || sample.length === 0) return [];
          const value = new Decimal(fact.value.value);
          return [
            [
              key,
              {
                ...fact,
                value: {
                  value: fact.value.value,
                  marketMedian: percentPoints(median(sample)),
                  marketMean: percentPoints(mean(sample)),
                  percentile: percentile(value, sample),
                },
              },
            ],
          ];
        }),
      ),
    },
  }));
}

/** Pure. A bank that is not in the directory, or that has no assets, is omitted. */
export function parseFdicFinancials(
  raw: FdicFinancialsRaw,
  institutionIds: ReadonlySet<string>,
): CallReport[] {
  const rows: CallReport[] = [];
  let quarter: string | null = null;
  for (const response of raw.responses) {
    for (const objectText of innerObjects(response.body)) {
      const compact = quoted(objectText, 'REPDTE');
      const asOf = compact === null ? null : reportDate(compact);
      if (asOf === null) throw new Error('fdic financials date');
      quarter ??= asOf;
      const row = oneReport(objectText, response.url, raw.retrievedAt, quarter);
      if (row === null || !institutionIds.has(row.report.institutionId)) continue;
      rows.push(row);
    }
  }
  return withMarket(rows);
}

function limitsOf(key: MetricKey): readonly [string, string] | null {
  if (key === 'liquidAssetsToAssets') return null;
  const pair = FINANCIAL_BOUNDS[key];
  return pair;
}

function outOfBounds(key: MetricKey, value: number): boolean {
  const limits = limitsOf(key);
  if (limits === null) return false;
  const points = new Decimal(value);
  return points.lt(limits[0]) || points.gt(limits[1]);
}

function moved(next: number, previous: number): boolean {
  return new Decimal(next).minus(previous).abs().gt(FINANCIAL_BOUNDS.maxMove);
}

export function validateFdicFinancials(
  rows: readonly CallReport[],
  previous: readonly CallReport[],
  asOf: string,
): ValidationReport<CallReport> {
  if (rows.length === 0) return { clean: [], suspicious: [], blocked: 'empty' };
  if (rows.some((row) => row.report.asOf > asOf)) {
    return { clean: [], suspicious: [], blocked: 'future' };
  }
  const prior = new Map(previous.map((row) => [row.report.institutionId, row]));
  const suspicious: { key: string; reasons: string[] }[] = [];
  const clean: CallReport[] = [];
  for (const row of rows) {
    const reasons: string[] = [];
    for (const key of METRIC_KEYS) {
      const fact = row.report.metrics[key];
      if (fact === undefined) continue;
      if (outOfBounds(key, fact.value.value)) reasons.push(`${key} bounds`);
      const before = prior.get(row.report.institutionId)?.report.metrics[key];
      if (before !== undefined && moved(fact.value.value, before.value.value)) {
        reasons.push(`${key} move`);
      }
    }
    if (reasons.length > 0) suspicious.push({ key: row.report.institutionId, reasons });
    else clean.push(row);
  }
  return { clean, suspicious, blocked: null };
}
