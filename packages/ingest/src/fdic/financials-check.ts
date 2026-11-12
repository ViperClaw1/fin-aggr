import { METRIC_KEYS, type BankMetrics as Report, type MetricKey } from '@fa/contracts';
import { Decimal } from 'decimal.js';
import { FINANCIAL_BOUNDS, FINANCIAL_IMPOSSIBLE, FINANCIAL_OUTLIER_SHARE } from '../policy';
import type { ValidationReport } from '../validate';
import type { CallReport } from './financials-types';
import { mean, median, percentPoints, percentile } from './financials-market';

function outsideBand(key: MetricKey, value: Decimal): boolean {
  if (key === 'liquidAssetsToAssets') return false;
  const band = FINANCIAL_BOUNDS[key];
  return value.lt(band.low) || value.gt(band.high);
}

function impossiblePoint(value: Decimal): boolean {
  return value.lt(FINANCIAL_IMPOSSIBLE.low) || value.gt(FINANCIAL_IMPOSSIBLE.high);
}

function jumped(key: MetricKey, next: Decimal, previous: Decimal): boolean {
  if (key === 'liquidAssetsToAssets') return false;
  return next.minus(previous).abs().gt(FINANCIAL_BOUNDS[key].move);
}

function flagRow(row: CallReport, previous: CallReport | undefined): CallReport {
  const metrics = { ...row.report.metrics };
  for (const key of METRIC_KEYS) {
    const fact = metrics[key];
    if (fact === undefined) continue;
    const value = new Decimal(fact.value.value);
    const before = previous?.report.metrics[key];
    const prior = before === undefined ? null : new Decimal(before.value.value);
    let outlier: 'band' | 'jump' | null = null;
    if (outsideBand(key, value)) outlier = 'band';
    else if (prior !== null && jumped(key, value, prior)) outlier = 'jump';
    metrics[key] = { ...fact, value: { ...fact.value, outlier } };
  }
  return { ...row, report: { ...row.report, metrics } };
}

function marketMetrics(
  row: CallReport,
  samples: ReadonlyMap<MetricKey, readonly Decimal[]>,
): Report['metrics'] {
  const metrics: Report['metrics'] = {};
  for (const key of METRIC_KEYS) {
    const fact = row.report.metrics[key];
    const sample = samples.get(key);
    if (fact === undefined || sample === undefined) continue;
    const outlier = fact.value.outlier;
    const market =
      sample.length === 0
        ? { marketMedian: 0, marketMean: 0, percentile: null }
        : {
            marketMedian: percentPoints(median(sample)),
            marketMean: percentPoints(mean(sample)),
            percentile: outlier === null ? percentile(new Decimal(fact.value.value), sample) : null,
          };
    metrics[key] = { ...fact, value: { ...fact.value, ...market, outlier } };
  }
  return metrics;
}

/** Outliers stay in the rows and out of the median, mean, and percentile. */
export function withMarket(
  rows: readonly CallReport[],
  previous: readonly CallReport[],
): CallReport[] {
  const prior = new Map(previous.map((row) => [row.report.institutionId, row]));
  const flagged = rows.map((row) => flagRow(row, prior.get(row.report.institutionId)));
  const samples = new Map<MetricKey, Decimal[]>();
  for (const key of METRIC_KEYS) {
    samples.set(
      key,
      flagged.flatMap((row) => {
        const fact = row.report.metrics[key];
        if (fact === undefined || fact.value.outlier) return [];
        return [new Decimal(fact.value.value)];
      }),
    );
  }
  return flagged.map((row) => ({
    ...row,
    report: { ...row.report, metrics: marketMetrics(row, samples) },
  }));
}

function bandShare(rows: readonly CallReport[]): boolean {
  const limit = new Decimal(FINANCIAL_OUTLIER_SHARE);
  for (const key of METRIC_KEYS) {
    const values = rows.flatMap((row) => {
      const fact = row.report.metrics[key];
      return fact === undefined ? [] : [new Decimal(fact.value.value)];
    });
    if (values.length === 0) continue;
    const outside = values.filter((value) => outsideBand(key, value)).length;
    if (new Decimal(outside).div(values.length).gt(limit)) return true;
  }
  return false;
}

function inMarket(rows: readonly CallReport[], key: MetricKey): Decimal[] {
  return rows.flatMap((row) => {
    const fact = row.report.metrics[key];
    if (fact === undefined || fact.value.outlier) return [];
    return [new Decimal(fact.value.value)];
  });
}

function medianMoved(current: readonly CallReport[], previous: readonly CallReport[]): boolean {
  if (previous.length === 0) return false;
  for (const key of METRIC_KEYS) {
    if (key === 'liquidAssetsToAssets') continue;
    const now = inMarket(current, key);
    const then = inMarket(previous, key);
    if (then.length > 0 && now.length === 0) return true;
    if (now.length === 0 || then.length === 0) continue;
    if (median(now).minus(median(then)).abs().gt(FINANCIAL_BOUNDS[key].move)) return true;
  }
  return false;
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
  const impossible = rows.flatMap((row) => {
    const hit = METRIC_KEYS.some((key) => {
      const fact = row.report.metrics[key];
      return fact !== undefined && impossiblePoint(new Decimal(fact.value.value));
    });
    return hit ? [{ key: row.report.institutionId, reasons: ['impossible'] }] : [];
  });
  if (impossible.length > 0) return { clean: [], suspicious: impossible, blocked: 'impossible' };
  const marked = withMarket(rows, previous);
  if (bandShare(marked)) return { clean: [], suspicious: [], blocked: 'outlier_share' };
  if (medianMoved(marked, previous)) return { clean: [], suspicious: [], blocked: 'median_move' };
  return { clean: marked, suspicious: [], blocked: null };
}
