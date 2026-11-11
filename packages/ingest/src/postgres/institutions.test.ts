import { Institution } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import { integerId } from './id';
import { commitInstitutions } from './institutions';

const bank = Institution.parse({
  id: 'fdic:3510',
  name: 'Bank of America, National Association',
  regulator: 'FDIC',
  kind: 'direct_bank',
  partnerInstitutionIds: [],
  hqState: 'NC',
  website: 'https://www.bankofamerica.com',
  provenance: {
    sourceId: 'fdic-institutions',
    sourceUrl: 'https://api.fdic.gov/banks/institutions',
    retrievedAt: '2026-11-09T12:00:00.000Z',
    verification: { status: 'verified', verifiedAt: '2026-11-09', by: 'official_api' },
    isMock: false,
  },
});

function memorySql(): { sql: Sql; texts: string[] } {
  const texts: string[] = [];
  const sql: Sql = {
    query: (text) => {
      texts.push(text);
      if (text.includes('dataset_versions')) return Promise.resolve({ rows: [{ id: '17' }] });
      if (text.includes('review_queue')) return Promise.resolve({ rows: [{ id: '4' }] });
      return Promise.resolve({ rows: [] });
    },
  };
  return { sql, texts };
}

describe('database ids', () => {
  it('reads a bigint string without a float conversion', () => {
    expect(integerId('17')).toBe(17);
    expect(integerId(17)).toBe(17);
    expect(() => integerId('01')).toThrow('database id is not an integer');
    expect(() => integerId(-1)).toThrow('database id is not an integer');
  });
});

describe('institution publish', () => {
  it('publishes one version and makes it current', async () => {
    const { sql, texts } = memorySql();
    const result = await commitInstitutions(sql, {
      publish: [bank],
      queue: null,
      asOf: '2026-11-11T08:00:00.000Z',
    });
    expect(result).toEqual({ queueId: null, versionId: 17 });
    expect(texts.some((text) => text.includes("publish_domain('institutions'"))).toBe(true);
    expect(texts.some((text) => text.includes('insert into institutions'))).toBe(true);
    expect(texts.at(-1)).toContain('commit');
  });

  it('queues a batch without publishing a version', async () => {
    const { sql, texts } = memorySql();
    const result = await commitInstitutions(sql, {
      publish: null,
      queue: {
        sourceId: 'fdic-institutions',
        domain: 'institutions',
        snapshotId: 3,
        reason: 'shrunk',
      },
      asOf: '2026-11-11T08:00:00.000Z',
    });
    expect(result).toEqual({ queueId: 4, versionId: null });
    expect(texts.some((text) => text.includes('publish_domain'))).toBe(false);
  });
});
