/**
 * Days after which a fact is shown as "may be outdated" (FreshnessLabel `staleAfterDays`).
 * Product decision, 2026-10-28. Bank metrics count from their report `asOf`: quarterly
 * reports plus publication delay.
 */
export const STALE_AFTER_DAYS = {
  apy: 7,
  terms: 90,
  bankMetrics: 120,
} as const;
