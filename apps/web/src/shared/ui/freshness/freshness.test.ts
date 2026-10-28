import { describe, expect, it } from 'vitest';
import { absoluteDate, freshnessText, isStale } from './freshness';

const NOW = new Date('2026-10-28T10:00:00Z');

describe('freshnessText', () => {
  it('says today for the same UTC day, even hours apart', () => {
    expect(freshnessText('2026-10-28T00:00:01Z', NOW)).toBe('Updated today');
  });

  it('says yesterday across UTC midnight, even a minute before it', () => {
    const justAfterMidnight = new Date('2026-10-28T00:01:00Z');
    expect(freshnessText('2026-10-27T23:59:00Z', justAfterMidnight)).toBe('Updated yesterday');
  });

  it('counts calendar days for older dates and date-only values', () => {
    expect(freshnessText('2026-10-20', NOW)).toBe('Updated 8 days ago');
  });

  it('uses the UTC day of an offset timestamp', () => {
    // 23:30 at -05:00 is 04:30 UTC on Oct 28
    expect(freshnessText('2026-10-27T23:30:00-05:00', NOW)).toBe('Updated today');
  });

  it('shows the absolute date instead of a negative age for a future date', () => {
    expect(freshnessText('2026-10-30', NOW)).toBe('Updated Oct 30, 2026');
  });
});

describe('isStale', () => {
  it('is stale only past the threshold', () => {
    expect(isStale('2026-09-28', NOW, 30)).toBe(false);
    expect(isStale('2026-09-27', NOW, 30)).toBe(true);
  });

  it('never marks a future date stale', () => {
    expect(isStale('2026-12-01', NOW, 0)).toBe(false);
  });
});

describe('absoluteDate', () => {
  it('formats in UTC, not the local zone', () => {
    expect(absoluteDate('2026-10-27T23:30:00-05:00')).toBe('Oct 28, 2026');
  });
});
