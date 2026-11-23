import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import { commitFederalBrackets2026 } from './commit';

function fakeSql(confirmed: boolean): { sql: Sql; texts: string[]; params: unknown[][] } {
  const texts: string[] = [];
  const params: unknown[][] = [];
  const sql: Sql = {
    query: (text, values = []) => {
      texts.push(text);
      params.push([...values]);
      if (text.includes('from fact_confirmations')) {
        return Promise.resolve({
          rows: confirmed ? [{ login: 'ViperClaw1', verified_at: '2026-11-23' }] : [],
        });
      }
      if (text.includes('from tax_tables t')) return Promise.resolve({ rows: [{ version_id: 7 }] });
      return Promise.resolve({ rows: [] });
    },
  };
  return { sql, texts, params };
}

describe('commitFederalBrackets2026', () => {
  it('writes nothing without the second checker', async () => {
    const { sql, texts } = fakeSql(false);
    await expect(commitFederalBrackets2026(sql)).rejects.toThrow('second checker');
    expect(texts.some((t) => /update|insert|delete/i.test(t.split('\n')[0] ?? ''))).toBe(false);
  });

  it('keeps the states source and replaces the 28 federal brackets', async () => {
    const { sql, texts, params } = fakeSql(true);
    expect(await commitFederalBrackets2026(sql)).toBe(7);
    const update = texts.findIndex((t) => t.includes('update tax_tables'));
    expect(texts[update]).toContain('states_provenance = coalesce(states_provenance, provenance)');
    expect(JSON.parse(String(params[update]?.[2]))).toEqual({
      sourceId: 'irs-rev-proc',
      sourceUrl: 'https://www.irs.gov/irb/2025-45_IRB',
      retrievedAt: '2026-11-10T00:00:00.000Z',
      verification: { status: 'verified', verifiedAt: '2026-11-23', by: 'human' },
      isMock: false,
    });
    expect(texts.filter((t) => t.includes('insert into tax_brackets'))).toHaveLength(28);
    expect(texts.findIndex((t) => t.includes('delete from tax_brackets'))).toBeGreaterThan(update);
  });
});
