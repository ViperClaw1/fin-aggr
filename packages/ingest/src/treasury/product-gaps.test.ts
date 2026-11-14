import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import { commitAuctionHold } from '../postgres/auctions';
import { missingFieldsReason, publishTreasuryProducts, treasuryProductGaps } from './product-gaps';

describe('treasury product gaps', () => {
  it('keeps one unverified quote for each missing product field', () => {
    const gaps = treasuryProductGaps();
    expect(gaps.map((gap) => gap.field)).toEqual([
      'tier',
      'early_withdrawal',
      'eligibility',
      'tax_treatment',
    ]);
    expect(gaps.map((gap) => gap.verification)).toEqual([
      'unverified',
      'unverified',
      'unverified',
      'unverified',
    ]);
    expect(gaps.every((gap) => gap.quote.length > 0 && gap.quote.length <= 400)).toBe(true);
    expect(missingFieldsReason()).toBe(
      'missing_fields:tier,early_withdrawal,eligibility,tax_treatment',
    );
    expect(gaps.find((gap) => gap.field === 'tax_treatment')?.quote).toContain('3124');
  });

  it('refuses to publish products before the quotes are confirmed', async () => {
    expect(() => publishTreasuryProducts()).toThrow('product-field quotes are confirmed');
    const sql: Sql = { query: () => Promise.resolve({ rows: [] }) };
    await expect(commitAuctionHold(sql, { publish: [{ id: 'ust' }], queue: null })).rejects.toThrow(
      'product-field quotes are confirmed',
    );
  });

  it('updates the open review instead of publishing a version', async () => {
    const calls: string[] = [];
    const sql: Sql = {
      query: (text) => {
        calls.push(text.trim().split('\n')[0] ?? text);
        if (text.includes('issue_url')) {
          return Promise.resolve({
            rows: [{ id: 8, issue_url: 'https://github.com/ViperClaw1/fin-aggr-review/issues/3' }],
          });
        }
        return Promise.resolve({ rows: [] });
      },
    };
    const result = await commitAuctionHold(sql, {
      publish: null,
      queue: {
        sourceId: 'treasury-fiscal-data',
        domain: 'treasury',
        snapshotId: 4,
        reason: missingFieldsReason(),
      },
    });
    expect(result).toEqual({
      queueId: 8,
      versionId: null,
      issueUrl: 'https://github.com/ViperClaw1/fin-aggr-review/issues/3',
    });
    expect(calls.some((call) => call.startsWith('insert into dataset_versions'))).toBe(false);
  });
});
