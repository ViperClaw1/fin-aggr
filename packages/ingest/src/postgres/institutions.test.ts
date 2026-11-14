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

function memorySql(kept: Record<string, unknown>[] = []): {
  sql: Sql;
  texts: string[];
  values: unknown[][];
} {
  const texts: string[] = [];
  const values: unknown[][] = [];
  const sql: Sql = {
    query: (text, params) => {
      texts.push(text);
      values.push([...(params ?? [])]);
      if (text.includes('select is_mock')) return Promise.resolve({ rows: [{ is_mock: false }] });
      if (text.includes('from institutions')) return Promise.resolve({ rows: kept });
      if (text.includes('dataset_versions')) return Promise.resolve({ rows: [{ id: '17' }] });
      if (text.includes('review_queue')) return Promise.resolve({ rows: [{ id: '4' }] });
      return Promise.resolve({ rows: [] });
    },
  };
  return { sql, texts, values };
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
      prefix: 'fdic:',
    });
    expect(result).toEqual({ queueId: null, versionId: 17, issueUrl: null });
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
      prefix: 'fdic:',
    });
    expect(result).toEqual({ queueId: 4, versionId: null, issueUrl: null });
    expect(texts.some((text) => text.includes('publish_domain'))).toBe(false);
  });

  it('keeps a credit union when the bank file is published', async () => {
    const kept = {
      id: 'ncua:9',
      name: 'Example Credit Union',
      regulator: 'NCUA',
      kind: 'credit_union',
      partner_institution_ids: [],
      hq_state: 'UT',
      website: null,
      provenance: bank.provenance,
    };
    const { sql, values } = memorySql([kept]);
    await commitInstitutions(sql, {
      publish: [bank],
      queue: null,
      asOf: '2026-11-11T08:00:00.000Z',
      prefix: 'fdic:',
    });
    const insert = values.find((params) => JSON.stringify(params).includes('ncua:9'));
    expect(insert?.[1]).toEqual(['ncua:9', 'fdic:3510']);
  });

  it('keeps a bank when the credit-union file is published', async () => {
    const creditUnion = Institution.parse({
      ...bank,
      id: 'ncua:9',
      regulator: 'NCUA',
      kind: 'credit_union',
      website: null,
    });
    const { sql, values } = memorySql([
      {
        id: bank.id,
        name: bank.name,
        regulator: bank.regulator,
        kind: bank.kind,
        partner_institution_ids: [],
        hq_state: bank.hqState,
        website: bank.website,
        provenance: bank.provenance,
      },
    ]);
    await commitInstitutions(sql, {
      publish: [creditUnion],
      queue: null,
      asOf: '2026-11-11T08:00:00.000Z',
      prefix: 'ncua:',
      sourceId: 'ncua-5300',
    });
    const insert = values.find((params) => JSON.stringify(params).includes('fdic:3510'));
    expect(insert?.[1]).toEqual(['fdic:3510', 'ncua:9']);
  });
});
