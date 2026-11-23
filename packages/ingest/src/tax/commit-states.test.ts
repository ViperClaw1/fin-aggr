import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import { commitStateRates2026 } from './commit-states';

function fakeSql(confirmedIds: string[]): { sql: Sql; texts: string[]; params: unknown[][] } {
  const texts: string[] = [];
  const params: unknown[][] = [];
  const sql: Sql = {
    query: (text, values = []) => {
      texts.push(text);
      params.push([...values]);
      if (text.includes('from fact_confirmations')) {
        return Promise.resolve({
          rows: confirmedIds.map((id) => ({ fact_id: id, verified_at: '2026-11-24' })),
        });
      }
      if (text.includes('from tax_tables t')) return Promise.resolve({ rows: [{ version_id: 5 }] });
      if (text.includes('update state_tax_rates')) {
        return Promise.resolve({ rows: [{ state_code: values[2] }] });
      }
      return Promise.resolve({ rows: [] });
    },
  };
  return { sql, texts, params };
}

describe('commitStateRates2026', () => {
  it('writes nothing without a confirmed state', async () => {
    const { sql, texts } = fakeSql([]);
    await expect(commitStateRates2026(sql)).rejects.toThrow('no confirmed state rates');
    expect(texts.some((t) => /update|insert/i.test(t))).toBe(false);
  });

  it('writes only the confirmed states', async () => {
    const { sql } = fakeSql(['tax:state-2026:nc', 'tax:state-2026:tx']);
    expect(await commitStateRates2026(sql)).toEqual(['TX', 'NC']);
  });

  it('stores the rate and its own verified source', async () => {
    const { sql, texts, params } = fakeSql(['tax:state-2026:nc']);
    await commitStateRates2026(sql);
    const update = params[texts.findIndex((t) => t.includes('update state_tax_rates'))] ?? [];
    expect(update.slice(0, 4)).toEqual([5, 2026, 'NC', '0.0399']);
    expect(JSON.parse(String(update[4]))).toEqual({
      sourceId: 'state-revenue-nc',
      sourceUrl: 'https://www.ncdor.gov/taxes-forms/individual-income-tax/tax-rate-schedules',
      retrievedAt: '2026-11-23T00:00:00.000Z',
      verification: { status: 'verified', verifiedAt: '2026-11-24', by: 'human' },
      isMock: false,
    });
  });
});
