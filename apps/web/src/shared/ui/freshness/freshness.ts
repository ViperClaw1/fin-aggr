// Relative freshness of a source date. Days are counted on the UTC calendar on both sides, so the
// server and the browser render the same text whatever their time zones (no hydration mismatch).

const DAY_MS = 86_400_000;
const utcDay = (ms: number): number => Math.floor(ms / DAY_MS);

const ABSOLUTE = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'medium' });

/** Calendar days from `at` to `now` (UTC); negative when `at` is in the future. */
function ageInDays(at: string, now: Date): number {
  return utcDay(now.getTime()) - utcDay(Date.parse(at));
}

/** "Oct 25, 2026" (UTC). */
export const absoluteDate = (at: string): string => ABSOLUTE.format(Date.parse(at));

/** "Updated today" / "yesterday" / "N days ago"; a future date (clock skew) shows the absolute date. */
export function freshnessText(at: string, now: Date): string {
  const days = ageInDays(at, now);
  if (days < 0) return `Updated ${absoluteDate(at)}`;
  if (days === 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  return `Updated ${String(days)} days ago`;
}

/** Older than the threshold; a future date is never stale. */
export const isStale = (at: string, now: Date, staleAfterDays: number): boolean =>
  ageInDays(at, now) > staleAfterDays;
