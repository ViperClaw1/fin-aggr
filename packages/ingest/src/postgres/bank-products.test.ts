import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import { readAlly } from '../scrape/banks/57803';
import { commitBankProducts, confirmBank } from './bank-products';

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
    await confirmBank(sql, {
      sourceId: 'bank:fdic:57803',
      login: 'owner',
      verifiedAt: '2026-11-15',
    });
    expect(texts.some((text) => text.includes('bank_confirmations'))).toBe(true);
    expect(texts.some((text) => text.includes('publish_domain'))).toBe(false);
  });
});
