/** Review decisions from ADR-020. The login is a GitHub login, never an email. */
export const REVIEW_OWNER = 'ViperClaw1';

export const REVIEW_REPO = 'ViperClaw1/fin-aggr-review';

/** Signed snapshot links in the private issue expire after this many seconds. */
export const SIGNED_URL_SECONDS = 7 * 24 * 60 * 60;

/** A signal, not an SLA. Overdue rows stay held. */
export const OVERDUE_DAYS = 3;

/** Accepted 2026-11-04. One place so a revision is not a hunt through connectors. */
export const PRODUCT_BOUNDS = {
  apyMin: '0',
  apyMax: '0.15',
  maxRateMove: '0.005',
} as const;

/**
 * Call-report ratios are percent points, not rates.
 * `low`/`high` is the typical band. A value outside it is published as an outlier
 * and left out of the market median, mean, and percentile.
 * `move` is that metric's quarterly jump, in percentage points.
 * More than 5% of a metric outside the band, a median jump above `move`,
 * or a value outside the impossible envelope holds the quarter.
 * The band is a review rule, not an FDIC limit. See ADR-020.
 */
export const FINANCIAL_BOUNDS = {
  tier1LeverageRatio: { low: '0', high: '100', move: '2' },
  totalRiskBasedCapitalRatio: { low: '0', high: '100', move: '5' },
  allowanceToLoans: { low: '0', high: '100', move: '1' },
  loansToDeposits: { low: '0', high: '300', move: '25' },
  noncurrentLoansRatio: { low: '0', high: '100', move: '2' },
  returnOnAssets: { low: '-20', high: '20', move: '3' },
} as const;

/** A ratio outside this envelope cannot be a call-report percent. It holds the quarter. */
export const FINANCIAL_IMPOSSIBLE = { low: '-1000', high: '10000' } as const;

/** Share of values outside the typical band. Above this, the quarter is a mass shift. */
export const FINANCIAL_OUTLIER_SHARE = '0.05';

const LOGIN = /^[A-Za-z0-9-]{1,39}$/;

export function requireReviewer(login: string | undefined): string {
  const trimmed = login?.trim() ?? '';
  if (!LOGIN.test(trimmed)) {
    throw new Error('Reviewer login is missing. Set FA_REVIEWER or run gh auth.');
  }
  return trimmed;
}

export function formatIssueCreated(issueNumber: number): string {
  return `issue #${String(issueNumber)} created`;
}

export function formatOverdue(id: number): string {
  return `overdue #${String(id)} mentioned`;
}

export function formatNoIssue(id: number): string {
  return `overdue #${String(id)} has no issue`;
}

export function formatQueueCounts(openCount: number, overdueCount: number): string {
  return `open ${String(openCount)}\noverdue ${String(overdueCount)}`;
}

export function overdueComment(id: number): string {
  return `@${REVIEW_OWNER} review item ${String(id)} has been open for more than ${String(OVERDUE_DAYS)} days. The previous published version stays in place.`;
}
