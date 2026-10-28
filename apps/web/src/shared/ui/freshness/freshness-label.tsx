import type { IsoDate, IsoDateTime } from '@fa/contracts';
import { absoluteDate, freshnessText, isStale } from './freshness';

interface FreshnessLabelProps {
  /** `retrievedAt` or `verifiedAt` of a provenance. */
  at: IsoDateTime | IsoDate;
  /**
   * Passed in, never read here. On a statically built page the build time would freeze
   * "N days ago"; there the caller renders on the client with shared/lib/clock.
   */
  now: Date;
  /** Without it nothing is marked outdated: the threshold is a product rule set by the caller. */
  staleAfterDays?: number;
}

export function FreshnessLabel({ at, now, staleAfterDays }: FreshnessLabelProps) {
  const stale = staleAfterDays !== undefined && isStale(at, now, staleAfterDays);
  return (
    <span className="text-sm text-muted">
      <time dateTime={at} title={absoluteDate(at)}>
        {freshnessText(at, now)}
      </time>
      {stale ? (
        <span className="ml-2 font-medium text-warn">
          <span aria-hidden="true">⚠ </span>may be outdated
        </span>
      ) : null}
    </span>
  );
}
