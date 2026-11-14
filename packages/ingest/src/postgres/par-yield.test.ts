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

describe('par yield publish', () => {
  it('opens a new non-mock version and makes that version current', async () => {
    expect(point.rate).toBe('0.0498');
    let next = 20;
    const texts: string[] = [];
    const sql: Sql = {
      query: (text) => {
        texts.push(text);
        if (text.includes('insert into dataset_versions')) {
          next += 1;
          return Promise.resolve({ rows: [{ id: String(next) }] });
        }
        return Promise.resolve({ rows: [] });
      },
    };
    const first = await commitParYields(sql, { publish: [point], queue: null });
    const second = await commitParYields(sql, { publish: [point], queue: null });
    expect(first).toEqual({ queueId: null, versionId: 21 });
    expect(second).toEqual({ queueId: null, versionId: 22 });
    expect(texts.filter((text) => text.includes("publish_domain('par_yields'"))).toHaveLength(2);
    expect(texts.some((text) => text.includes("values ('par_yields', $1, false, false)"))).toBe(
      true,
    );
    expect(texts.some((text) => text.includes('delete from par_yields'))).toBe(false);
    expect(texts.some((text) => text.includes("'reference'"))).toBe(false);
  });
});
