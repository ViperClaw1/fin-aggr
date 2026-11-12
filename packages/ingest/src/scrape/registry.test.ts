import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import { upsertBankSources } from '../postgres/banks';
import {
  DEPOSIT_LIMIT,
  PILOT_LIMIT,
  selectBankRegistry,
  stateTimeZone,
  type DirectoryInstitution,
} from './registry';

function bank(
  id: string,
  state: string,
  website: string | null,
  kind: DirectoryInstitution['kind'] = 'direct_bank',
): DirectoryInstitution {
  return { id, name: `Bank ${id}`, kind, hqState: state, website };
}

const directory = [
  bank('fdic:1', 'CA', 'https://one.example/rates'),
  bank('fdic:2', 'NY', 'https://two.example/rates'),
  bank('fdic:3', 'TX', 'http://three.example/rates'),
  bank('ncua:4', 'HI', 'https://union.example/rates', 'credit_union'),
  bank('fdic:5', 'AZ', null),
];

describe('bank registry', () => {
  it('keeps the named pilot in order and does not fetch a page', () => {
    expect(PILOT_LIMIT).toBe(10);
    const rows = selectBankRegistry({
      institutions: directory,
      pilotIds: ['fdic:2', 'fdic:1'],
      deposits: [],
      openMembershipIds: [],
    });
    expect(rows.map((row) => row.institutionId)).toEqual(['fdic:2', 'fdic:1']);
    expect(rows[0]).toMatchObject({
      sourceId: 'bank:fdic:2',
      url: 'https://two.example/rates',
      timeZone: 'America/New_York',
      cohort: 'pilot',
      ratesChannel: 'unchecked',
    });
  });

  it('refuses an eleventh pilot bank, a credit union, a closed site, and a missing bank', () => {
    const ids = Array.from({ length: 11 }, (_, index) => `fdic:${String(index)}`);
    expect(() =>
      selectBankRegistry({
        institutions: ids.map((id) => bank(id, 'CA', 'https://pilot.example/rates')),
        pilotIds: ids,
        deposits: [],
        openMembershipIds: [],
      }),
    ).toThrow('pilot is limited to 10 banks');
    expect(() =>
      selectBankRegistry({
        institutions: directory,
        pilotIds: ['ncua:4'],
        deposits: [],
        openMembershipIds: [],
      }),
    ).toThrow('pilot bank ncua:4 is not a direct bank');
    expect(() =>
      selectBankRegistry({
        institutions: directory,
        pilotIds: ['fdic:3'],
        deposits: [],
        openMembershipIds: [],
      }),
    ).toThrow('scrape url is not public');
    expect(() =>
      selectBankRegistry({
        institutions: directory,
        pilotIds: ['fdic:9'],
        deposits: [],
        openMembershipIds: [],
      }),
    ).toThrow('bank fdic:9 is not in the directory');
  });

  it('fills deposits after the pilot, largest cents first, and skips a bank already chosen', () => {
    expect(DEPOSIT_LIMIT).toBe(50);
    const many = Array.from({ length: 52 }, (_, index) =>
      bank(`fdic:${String(index + 1)}`, 'CA', `https://b${String(index + 1)}.example/rates`),
    );
    const deposits = many.map((row, index) => ({
      institutionId: row.id,
      depositsCents: String(1000 + index),
    }));
    const rows = selectBankRegistry({
      institutions: many,
      pilotIds: ['fdic:52'],
      deposits,
      openMembershipIds: [],
    });
    expect(rows[0]?.institutionId).toBe('fdic:52');
    expect(rows[1]?.institutionId).toBe('fdic:51');
    expect(rows).toHaveLength(51);
    expect(rows.at(-1)?.institutionId).toBe('fdic:2');
    expect(rows.filter((row) => row.cohort === 'deposits')).toHaveLength(50);
    expect(rows.some((row) => row.institutionId === 'fdic:1')).toBe(false);
  });

  it('puts a named open-membership union last and refuses a bank in that list', () => {
    const rows = selectBankRegistry({
      institutions: directory,
      pilotIds: ['fdic:1'],
      deposits: [{ institutionId: 'fdic:2', depositsCents: '100' }],
      openMembershipIds: ['ncua:4'],
    });
    expect(rows.map((row) => row.cohort)).toEqual(['pilot', 'deposits', 'open-membership']);
    expect(rows[2]?.timeZone).toBe('Pacific/Honolulu');
    expect(() =>
      selectBankRegistry({
        institutions: directory,
        pilotIds: [],
        deposits: [],
        openMembershipIds: ['fdic:1'],
      }),
    ).toThrow('open membership fdic:1 is not a credit union');
    expect(stateTimeZone('AZ')).toBe('America/Phoenix');
    expect(() => stateTimeZone('XX')).toThrow('bank state XX has no time zone');
  });
});

describe('bank source rows', () => {
  it('inserts a scrape source and does not touch an empty cohort', async () => {
    const texts: string[] = [];
    const sql: Sql = {
      query: (text) => {
        texts.push(text);
        return Promise.resolve({ rows: [] });
      },
    };
    await upsertBankSources(sql, []);
    const [entry] = selectBankRegistry({
      institutions: directory,
      pilotIds: ['fdic:1'],
      deposits: [],
      openMembershipIds: [],
    });
    if (entry === undefined) throw new Error('expected a pilot bank');
    await upsertBankSources(sql, [entry]);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("'scrape'");
    expect(texts[0]).toContain('sources.excluded = false');
    expect(texts[0]).toContain('issuer_document');
  });
});
