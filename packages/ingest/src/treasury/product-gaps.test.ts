import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import { commitAuctionHold } from '../postgres/auctions';
import { missingFieldsReason, publishTreasuryProducts, treasuryProductGaps } from './product-gaps';

describe('treasury product gaps', () => {
  it('keeps one unverified quote for each missing product field', () => {
    const gaps = treasuryProductGaps();
    expect(gaps.map((gap) => gap.id)).toEqual([
      'treasury:tier',
      'treasury:min_opening',
      'treasury:early_withdrawal',
      'treasury:eligibility',
      'treasury:tax_treatment',
    ]);
    expect(gaps.map((gap) => gap.field)).toEqual([
      'tier',
      'min_opening',
      'early_withdrawal',
      'eligibility',
      'tax_treatment',
    ]);
    expect(gaps.map((gap) => gap.verification)).toEqual([
      'unverified',
      'unverified',
      'unverified',
      'unverified',
      'unverified',
    ]);
    expect(
      gaps.filter((gap) => gap.field !== 'eligibility').every((gap) => gap.quote.length <= 400),
    ).toBe(true);
    expect(missingFieldsReason()).toBe(
      'missing_fields:tier,min_opening,early_withdrawal,eligibility,tax_treatment',
    );
    expect(gaps.find((gap) => gap.field === 'tax_treatment')?.quote).toContain('3124');
    expect(gaps.find((gap) => gap.field === 'tier')).toMatchObject({
      citation: '31 CFR 356.20(d)(1)',
      productField: 'tiers',
      quote:
        'Single-price auctions. Both noncompetitive and competitive bidders receive the price equivalent to the high yield, high discount rate, or high discount margin at which bids were awarded. For inflation-protected securities, the price for awarded securities is the price equivalent to the high real yield.',
    });
    expect(gaps.find((gap) => gap.field === 'min_opening')).toMatchObject({
      citation: '31 CFR 356.12(a)',
      productField: 'minOpening',
      quote:
        'All bids must state the par amount of securities bid for and must equal or exceed the minimum to bid amount stated in the auction announcement. Bids in larger amounts must be in the multiple stated in the auction announcement.',
    });
    expect(gaps.find((gap) => gap.field === 'eligibility')?.quote).toBe(
      'Only an individual or an entity is eligible to open a TreasuryDirect account. In order to open a TreasuryDirect account, an individual or entity account manager must have a valid social security number (SSN), be 18 years of age or over, and be legally competent. An entity must have a valid SSN or employer identification number. The account owner must have a United States address of record and have an account at a United States depository financial institution that will accept debits and credits using the Automated Clearing House method of payment.',
    );
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
