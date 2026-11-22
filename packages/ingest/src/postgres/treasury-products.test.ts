import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import { latestOffers } from '../treasury/offers';
import { treasuryProductGaps } from '../treasury/product-gaps';
import { commitTreasuryProducts } from './treasury-products';

const SNAPSHOT = readFileSync(
  join(import.meta.dirname, '../treasury/auctioned.snapshot.json'),
  'utf8',
);
const offers = latestOffers(SNAPSHOT);
const AT = '2026-11-22T07:17:00.000Z';

function fakeSql(confirmed: readonly string[]): { sql: Sql; texts: string[]; params: unknown[][] } {
  const texts: string[] = [];
  const params: unknown[][] = [];
  const sql: Sql = {
    query: (text, values = []) => {
      texts.push(text);
      params.push([...values]);
      if (text.includes('from fact_confirmations')) {
        return Promise.resolve({
          rows: confirmed.map((id) => ({
            fact_id: id,
            login: 'ViperClaw1',
            verified_at: '2026-11-22',
          })),
        });
      }
      if (text.includes('insert into dataset_versions'))
        return Promise.resolve({ rows: [{ id: '41' }] });
      return Promise.resolve({ rows: [] });
    },
  };
  return { sql, texts, params };
}

const ALL = treasuryProductGaps().map((gap) => gap.id);

describe('treasury publish', () => {
  it('publishes the issuer and eight products on one new treasury version', async () => {
    const { sql, texts, params } = fakeSql(ALL);
    const result = await commitTreasuryProducts(sql, { publish: offers, queue: null }, AT);
    expect(result).toEqual({ queueId: null, versionId: 41, issueUrl: null });
    expect(texts.some((t) => t.includes("values ('treasury', $1, false, false)"))).toBe(true);
    const issuer = params[texts.findIndex((t) => t.includes('insert into institutions'))];
    expect(issuer?.slice(0, 6)).toEqual([
      41,
      'ust',
      'U.S. Department of the Treasury',
      'UST',
      'government',
      'DC',
    ]);
    expect(texts.filter((t) => t.includes('insert into products ('))).toHaveLength(8);
    expect(texts.filter((t) => t.includes("publish_domain('treasury'"))).toHaveLength(1);
  });

  it('publishes nothing while a quote is unconfirmed', async () => {
    const { sql, texts } = fakeSql(ALL.filter((id) => id !== 'treasury:eligibility'));
    await expect(commitTreasuryProducts(sql, { publish: offers, queue: null }, AT)).rejects.toThrow(
      'treasury facts not confirmed: treasury:eligibility',
    );
    expect(texts.some((t) => t.includes('publish_domain'))).toBe(false);
    expect(texts.some((t) => t.includes('insert into products ('))).toBe(false);
  });

  it('opens no version when there is nothing to publish', async () => {
    const { sql, texts } = fakeSql(ALL);
    const result = await commitTreasuryProducts(sql, { publish: null, queue: null }, AT);
    expect(result.versionId).toBeNull();
    expect(texts.some((t) => t.includes('insert into dataset_versions'))).toBe(false);
  });
});
