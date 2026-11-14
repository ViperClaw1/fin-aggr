import { rateFromPercent } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import type { NationalRate } from '../fred/national';
import { commitNationalRates } from './national';

const row: NationalRate = {
  seriesId: 'SNDR',
  label: 'National Rate: Savings',
  date: '2026-10-01',
  rate: rateFromPercent('0.38'),
};

describe('national rates publish', () => {
  it('opens a new non-mock version and makes that version current', async () => {
    let next = 30;
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
    const result = await commitNationalRates(sql, { publish: [row], queue: null });
    expect(result).toEqual({ queueId: null, versionId: 31, issueUrl: null });
    expect(texts.some((text) => text.includes("publish_domain('national_rates'"))).toBe(true);
    expect(texts.some((text) => text.includes("values ('national_rates', $1, false, false)"))).toBe(
      true,
    );
    expect(texts.some((text) => text.includes('delete from national_deposit_rates'))).toBe(false);
    expect(texts.some((text) => text.includes("'reference'"))).toBe(false);
  });
});
