// ADR-016 D6: counted from the data set date, the demo shows both fresh and stale facts of each
// kind, so freshness labels and their thresholds are visible. Here because the thresholds are a
// web setting (shared/config) and fixtures cannot import the app.
import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { describe, expect, it } from 'vitest';
import { STALE_AFTER_DAYS } from '@/shared/config';

const DAY_MS = 86_400_000;
const f = generateFixtures(DEFAULT_SEED);
const asOfMs = Date.parse(`${f.asOf}T00:00:00Z`);
const ageDays = (at: string): number => (asOfMs - Date.parse(at)) / DAY_MS;

function split(ages: number[], staleAfter: number): { fresh: number; stale: number } {
  return {
    fresh: ages.filter((a) => a <= staleAfter).length,
    stale: ages.filter((a) => a > staleAfter).length,
  };
}

describe('fixture retrieval dates against STALE_AFTER_DAYS', () => {
  it.each([
    ['apy', f.products.map((p) => ageDays(p.provenance.retrievedAt)), STALE_AFTER_DAYS.apy],
    [
      'terms',
      f.products.map((p) => ageDays(p.earlyWithdrawal.provenance.retrievedAt)),
      STALE_AFTER_DAYS.terms,
    ],
    [
      'bankMetrics',
      f.bankMetrics.map((m) => ageDays(`${m.asOf}T00:00:00Z`)),
      STALE_AFTER_DAYS.bankMetrics,
    ],
  ])('%s has fresh and stale examples, none after asOf', (_, ages, staleAfter) => {
    const { fresh, stale } = split(ages, staleAfter);
    expect(fresh).toBeGreaterThan(0);
    expect(stale).toBeGreaterThan(0);
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(0);
  });
  it('the same seed gives the same retrieval dates', () => {
    expect(generateFixtures(DEFAULT_SEED)).toEqual(f);
  });
});
