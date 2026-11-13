import { Provenance } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import { commitInsuranceLimits, publishSavedInsuranceQuotes, type ConfirmedLimit } from './publish';

const provenance = Provenance.parse({
  sourceId: 'insurance-limit',
  sourceUrl:
    'https://www.ecfr.gov/current/title-12/chapter-III/subchapter-B/part-330/section-330.1',
  retrievedAt: '2026-11-13T12:00:00.000Z',
  verification: { status: 'verified', verifiedAt: '2026-11-13', by: 'human' },
  isMock: false,
});

describe('insurance limit publish', () => {
  it('does not publish the saved unverified quotes', () => {
    expect(() => publishSavedInsuranceQuotes()).toThrow('saved HTML is confirmed');
  });

  it('writes a confirmed limit onto the current reference version and leaves par yields alone', async () => {
    const texts: string[] = [];
    const sql: Sql = {
      query: (text) => {
        texts.push(text);
        if (text.includes('dataset_versions')) return Promise.resolve({ rows: [{ id: '3' }] });
        return Promise.resolve({ rows: [] });
      },
    };
    const limits: ConfirmedLimit[] = [
      { regulator: 'FDIC', limitPerOwner: 25000000, provenance },
      { regulator: 'NCUA', limitPerOwner: 25000000, provenance },
    ];
    await expect(commitInsuranceLimits(sql, limits)).resolves.toBe(3);
    expect(texts.some((text) => text.includes('par_yields'))).toBe(false);
    expect(texts.some((text) => text.includes('publish_domain'))).toBe(false);
    expect(texts.some((text) => text.includes('insurance_limits'))).toBe(true);
  });
});
