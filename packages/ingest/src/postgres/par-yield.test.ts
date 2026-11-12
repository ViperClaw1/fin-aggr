import { rateFromPercent } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import type { ParYieldPoint } from '../treasury/par-yield';
import { commitParYields } from './par-yield';

const point: ParYieldPoint = {
  date: '2026-11-10',
  tenor: '10Y',
  rate: rateFromPercent('4.98'),
};

function memorySql(current: boolean): { sql: Sql; texts: string[] } {
  const texts: string[] = [];
  const sql: Sql = {
    query: (text) => {
      texts.push(text);
      if (text.includes('and is_current')) {
        return Promise.resolve({ rows: current ? [{ id: '9' }] : [] });
      }
      if (text.includes('insert into dataset_versions'))
        return Promise.resolve({ rows: [{ id: '17' }] });
      if (text.includes('review_queue')) return Promise.resolve({ rows: [{ id: '4' }] });
      return Promise.resolve({ rows: [] });
    },
  };
  return { sql, texts };
}

describe('par yield publish', () => {
  it('keeps the current reference version when tax or insurance already published', async () => {
    expect(point.rate).toBe('0.0498');
    const { sql, texts } = memorySql(true);
    const result = await commitParYields(sql, { publish: [point], queue: null });
    expect(result).toEqual({ queueId: null, versionId: 9 });
    expect(texts.some((text) => text.includes('delete from par_yields'))).toBe(true);
    expect(texts.some((text) => text.includes('insert into par_yields'))).toBe(true);
    expect(texts.some((text) => text.includes('publish_domain'))).toBe(false);
  });

  it('opens a reference version only when none is current', async () => {
    const { sql, texts } = memorySql(false);
    const result = await commitParYields(sql, { publish: [point], queue: null });
    expect(result).toEqual({ queueId: null, versionId: 17 });
    expect(texts.some((text) => text.includes("publish_domain('reference'"))).toBe(true);
  });
});
