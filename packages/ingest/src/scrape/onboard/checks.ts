import { rateFromPercent } from '@fa/contracts';
import { Decimal } from 'decimal.js';
import type { NationalRate } from '../../fred/national';

/**
 * ADR-026 checks 5 and 7 (owner, 2026-11-28). Pure: rates arrive as decimal strings, nothing
 * passes through a float. Reasons follow the review-queue style `<check>:<term>`.
 */

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Stated APYs are rounded to 0.01 pp; the recomputed one must land within 1 bp of it. */
const APY_TOLERANCE = new D('0.0001');
/** Owner's band: APY above the national rate for the term + 3.00 pp is an outlier. */
const OUTLIER_SPREAD = new D('0.03');

const PERIODS = { daily: 365, monthly: 12 } as const;

interface Rated {
  termMonths: number;
  apyPercent: string;
  /** Empty when the page states no interest rate for the term. */
  ratePercent: string;
}

function fraction(percent: string): Decimal | null {
  try {
    return new D(rateFromPercent(percent));
  } catch {
    return null;
  }
}

/**
 * Check 5: APY = (1 + rate / n)^n − 1 for the page's compounding (12 CFR 1030 Appendix A, a
 * 365-day year). A product whose page states no rate is not applicable and passes.
 */
export function apyRateFailures(
  products: readonly Rated[],
  compounding: keyof typeof PERIODS,
): string[] {
  const n = PERIODS[compounding];
  return products.flatMap((p) => {
    if (p.ratePercent === '') return [];
    const rate = fraction(p.ratePercent);
    const apy = fraction(p.apyPercent);
    if (rate === null || apy === null) return [`apy_rate_mismatch:${String(p.termMonths)}`];
    const computed = rate.div(n).plus(1).pow(n).minus(1);
    return computed.minus(apy).abs().gt(APY_TOLERANCE)
      ? [`apy_rate_mismatch:${String(p.termMonths)}`]
      : [];
  });
}

const CD_SERIES: readonly (readonly [number, NationalRate['seriesId']])[] = [
  [1, 'NDR1MCD'],
  [3, 'NDR3MCD'],
  [6, 'NDR6MCD'],
  [12, 'NDR12MCD'],
  [24, 'NDR24MCD'],
  [36, 'NDR36MCD'],
  [48, 'NDR48MCD'],
  [60, 'NDR60MCD'],
];

/** The FDIC series for a CD term: the nearest published term, the shorter one on a tie. */
function cdSeries(termMonths: number): NationalRate['seriesId'] {
  let best = CD_SERIES[0] ?? [1, 'NDR1MCD'];
  for (const row of CD_SERIES) {
    if (Math.abs(row[0] - termMonths) < Math.abs(best[0] - termMonths)) best = row;
  }
  return best[1];
}

/**
 * Check 7: APY at or below zero, or above the national rate for the term + 3.00 pp. No current
 * real national rates (a mock version, or none) fails closed: nothing to compare with.
 */
export function nationalOutliers(
  products: readonly Rated[],
  category: 'cd' | 'savings',
  national: readonly { seriesId: NationalRate['seriesId']; rate: string }[],
): string[] {
  if (national.length === 0) return ['national_rates_missing'];
  return products.flatMap((p) => {
    const id = category === 'savings' ? 'SNDR' : cdSeries(p.termMonths);
    const base = national.find((row) => row.seriesId === id);
    const apy = fraction(p.apyPercent);
    if (base === undefined) return [`national_rates_missing:${id}`];
    if (apy === null || apy.lte(0) || apy.gt(new D(base.rate).plus(OUTLIER_SPREAD))) {
      return [`national_outlier:${String(p.termMonths)}`];
    }
    return [];
  });
}
