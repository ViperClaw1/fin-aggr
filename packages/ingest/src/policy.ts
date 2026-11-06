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
