import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import { readAlly } from '../scrape/banks/57803';
import {
  commitBankProducts,
  confirmBank,
  confirmReviewedProducts,
  reviewedProductIds,
} from './bank-products';

const HTML = `<section><h3>Savings</h3><p>3.2% correct as of 11/12/26</p></section>`;

function memorySql(): { sql: Sql; texts: string[] } {
  const texts: string[] = [];
  const sql: Sql = {
    query: (text) => {
      texts.push(text);
      if (text.includes('insert into dataset_versions')) {
        return Promise.resolve({ rows: [{ id: '17' }] });
      }
      if (text.includes('review_queue') && text.includes('returning id')) {
        return Promise.resolve({ rows: [{ id: '4' }] });
      }
      if (text.includes('insert into bank_confirmations')) {
        return Promise.resolve({ rows: [{ source_id: 'bank:fdic:57803' }] });
      }
      if (text.includes('from review_queue')) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    },
  };
  return { sql, texts };
}

describe('bank product publish', () => {
  const product = readAlly(HTML).products[0];
  if (product === undefined) throw new Error('fixture');

  it('publishes clean rows on bank_products and keeps other banks', async () => {
    const { sql, texts } = memorySql();
    const result = await commitBankProducts(sql, {
      institutionId: 'fdic:57803',
      publish: [product],
      heldIds: ['fdic:57803:old'],
      queue: null,
    });
    expect(result).toEqual({ queueId: null, versionId: 17 });
    expect(texts.some((text) => text.includes("publish_domain('bank_products'"))).toBe(true);
    expect(texts.some((text) => text.includes("status = 'superseded'"))).toBe(true);
    expect(texts.some((text) => text.includes('v.is_mock = false'))).toBe(true);
    expect(texts.at(-1)).toContain('commit');
  });

  it('queues the first connection without a new version', async () => {
    const { sql, texts } = memorySql();
    const result = await commitBankProducts(sql, {
      institutionId: 'fdic:57803',
      publish: null,
      heldIds: [product.id],
      queue: {
        sourceId: 'bank:fdic:57803',
        domain: 'bank_products',
        snapshotId: 9,
        reason: `${product.id}: first_connection`,
      },
    });
    expect(result).toEqual({ queueId: 4, versionId: null });
    expect(texts.some((text) => text.includes('publish_domain'))).toBe(false);
  });

  it('records a human confirmation and does not publish', async () => {
    const { sql, texts } = memorySql();
    const state = await confirmBank(sql, {
      sourceId: 'bank:fdic:57803',
      login: 'owner',
      verifiedAt: '2026-11-15',
    });
    expect(state).toEqual({ created: true, login: 'owner', verifiedAt: '2026-11-15' });
    expect(texts.some((text) => text.includes('bank_confirmations'))).toBe(true);
    expect(texts.some((text) => text.includes('publish_domain'))).toBe(false);
  });

  it('returns the stored state for a bank that is already confirmed', async () => {
    const sql: Sql = {
      query: (text) =>
        Promise.resolve({
          rows: text.startsWith('select')
            ? [{ login: 'ViperClaw1', verified_at: '2026-11-15' }]
            : [],
        }),
    };
    const state = await confirmBank(sql, {
      sourceId: 'bank:fdic:57803',
      login: 'other',
      verifiedAt: '2026-11-17',
    });
    expect(state).toEqual({ created: false, login: 'ViperClaw1', verifiedAt: '2026-11-15' });
  });
});

describe('bank product confirmation from the queue', () => {
  it('reads only this bank product ids from a review reason', () => {
    expect(
      reviewedProductIds(
        'bank:fdic:27471',
        'fdic-27471-3200: first_connection; fdic-27471-3510: first_connection, stale; fdic-1-x: stale',
      ),
    ).toEqual(['fdic-27471-3200', 'fdic-27471-3510']);
    expect(reviewedProductIds('bank:fdic:27471', 'count 1 is under half of 4')).toEqual([]);
  });

  it('writes one confirmation per listed product and refuses a row with none', async () => {
    const values: unknown[][] = [];
    const sql: Sql = {
      query: (text, params) => {
        if (text.includes('bank_product_confirmations')) values.push([...(params ?? [])]);
        return Promise.resolve({ rows: [] });
      },
    };
    const input = { snapshotId: 9, login: 'ViperClaw1', verifiedAt: '2026-11-17' };
    const ids = await confirmReviewedProducts(sql, {
      ...input,
      sourceId: 'bank:fdic:57803',
      reason: 'fdic-57803-savings: first_connection',
    });
    expect(ids).toEqual(['fdic-57803-savings']);
    expect(values).toEqual([
      ['bank:fdic:57803', 'fdic-57803-savings', 'ViperClaw1', '2026-11-17', 9],
    ]);
    await expect(
      confirmReviewedProducts(sql, { ...input, sourceId: 'bank:fdic:57803', reason: 'empty' }),
    ).rejects.toThrow('review for bank:fdic:57803 lists no product');
  });
});
