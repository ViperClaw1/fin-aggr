// Health metrics for banks and credit unions. Partial on purpose: a missing metric is "n/a" in the UI.
import { MetricKey, type BankMetrics, type Institution } from '@fa/contracts';
import { AS_OF, mockProvenance } from './common';
import type { Rng } from './prng';

/** Plausible-looking percent ranges in hundredths (synthetic, not market data). */
const RANGES: Record<MetricKey, readonly [number, number]> = {
  tier1LeverageRatio: [600, 1400],
  totalRiskBasedCapitalRatio: [1000, 2000],
  allowanceToLoans: [50, 250],
  loansToDeposits: [5000, 11000],
  liquidAssetsToAssets: [500, 4000],
  noncurrentLoansRatio: [10, 300],
  returnOnAssets: [-50, 200],
};
const SKIP_PERCENT = 15;

// Metric values are display-only percents (spec §4), not money, so a decimal number is fine here.
const percent = (hundredths: number): number => hundredths / 100;

export function generateBankMetrics(rng: Rng, institutions: readonly Institution[]): BankMetrics[] {
  return institutions
    .filter((i) => i.kind !== 'fintech_partner')
    .map((institution) => {
      const metrics: BankMetrics['metrics'] = {};
      for (const key of MetricKey.options) {
        if (rng.chance(SKIP_PERCENT)) continue;
        const [lo, hi] = RANGES[key];
        const median = rng.int(lo, hi);
        metrics[key] = {
          value: {
            value: percent(rng.int(lo, hi)),
            marketMedian: percent(median),
            marketMean: percent(median + rng.int(-30, 30)),
            percentile: rng.int(1, 99),
          },
          provenance: mockProvenance('mock-call-reports'),
        };
      }
      return {
        institutionId: institution.id,
        asOf: AS_OF,
        totalAssetsUsdThousands: rng.int(50000, 90000000),
        metrics,
        balanceSheetMix: [
          { label: 'Loans', share: 0.6 },
          { label: 'Securities', share: 0.25 },
          { label: 'Cash and other', share: 0.15 },
        ],
        provenance: mockProvenance('mock-call-reports'),
      };
    });
}
