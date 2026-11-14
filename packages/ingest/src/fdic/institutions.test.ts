import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkInstitutionShape } from './live';
import {
  fdicInstitutionsSource,
  fetchFdicInstitutions,
  institutionEnvelopeProblems,
  institutionsUrl,
  parseFdicInstitutions,
  validateInstitutions,
  type FdicInstitutionsRaw,
} from './institutions';

const RETRIEVED_AT = '2026-11-09T12:00:00.000Z';

function raw(bodies: readonly { url: string; body: string }[]): FdicInstitutionsRaw {
  return { retrievedAt: RETRIEVED_AT, responses: bodies };
}

function record(fields: Record<string, unknown>): string {
  return JSON.stringify({ meta: { total: 1 }, data: [{ data: fields, score: 0 }] });
}

const recorded = readFileSync(join(import.meta.dirname, 'institutions.snapshot.json'), 'utf8');

describe('FDIC institutions', () => {
  it('maps the recorded BankFind response onto Institution', () => {
    const url = institutionsUrl(0, 1);
    const rows = parseFdicInstitutions(raw([{ url, body: recorded }]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'fdic:3510',
      name: 'Bank of America, National Association',
      regulator: 'FDIC',
      kind: 'direct_bank',
      partnerInstitutionIds: [],
      hqState: 'NC',
      website: 'https://www.bankofamerica.com',
      provenance: {
        sourceId: 'fdic-institutions',
        sourceUrl: url,
        retrievedAt: RETRIEVED_AT,
        verification: { status: 'verified', verifiedAt: '2026-11-09', by: 'official_api' },
        isMock: false,
      },
    });
    expect(institutionEnvelopeProblems(JSON.parse(recorded) as unknown)).toEqual([]);
  });

  it('keeps an address that already has a scheme and drops a blank one', () => {
    const withScheme = parseFdicInstitutions(
      raw([
        {
          url: institutionsUrl(0, 1),
          body: record({
            CERT: '628',
            NAME: 'Example Bank',
            STALP: 'ny',
            WEBADDR: 'http://example.com/rates',
            ACTIVE: 1,
            BKCLASS: 'NM',
          }),
        },
      ]),
    );
    expect(withScheme[0]?.website).toBe('http://example.com/rates');
    expect(withScheme[0]?.hqState).toBe('NY');

    const blank = parseFdicInstitutions(
      raw([
        {
          url: institutionsUrl(0, 1),
          body: record({
            CERT: 5,
            NAME: 'No Site',
            STALP: 'CA',
            WEBADDR: '  ',
            ACTIVE: '1',
            BKCLASS: 'SB',
          }),
        },
      ]),
    );
    expect(blank[0]?.website).toBeNull();
  });

  it('omits a closed institution and maps a credit-union class', () => {
    const rows = parseFdicInstitutions(
      raw([
        {
          url: institutionsUrl(0, 2),
          body: JSON.stringify({
            meta: { total: 2 },
            data: [
              { data: { CERT: 1, NAME: 'Closed', STALP: 'TX', ACTIVE: 0, BKCLASS: 'N' } },
              { data: { CERT: 2, NAME: 'A Union', STALP: 'TX', ACTIVE: 1, BKCLASS: 'CU' } },
            ],
          }),
        },
      ]),
    );
    expect(rows.map((row) => row.id)).toEqual(['fdic:2']);
    expect(rows[0]?.kind).toBe('credit_union');
  });

  it('fails the run when a row is not an Institution', () => {
    expect(() =>
      parseFdicInstitutions(
        raw([
          {
            url: institutionsUrl(0, 1),
            body: record({ CERT: 9, NAME: '', STALP: 'N', ACTIVE: 1, BKCLASS: 'N' }),
          },
        ]),
      ),
    ).toThrow('fdic institutions invalid');
  });

  it('reports a schema failure without publishing that row', () => {
    const report = validateInstitutions([{ id: 'fdic:1' }], []);
    expect(report.clean).toEqual([]);
    expect(report.suspicious.map((row) => row.key)).toEqual(['fdic:1']);
    expect(report.blocked).toBeNull();
  });

  it('pages until meta.total and stores the response text', async () => {
    const pages = [
      JSON.stringify({
        meta: { total: 2 },
        data: [{ data: { CERT: 1, NAME: 'One', STALP: 'OH', ACTIVE: 1, BKCLASS: 'N' } }],
      }),
      JSON.stringify({
        meta: { total: 2 },
        data: [{ data: { CERT: 2, NAME: 'Two', STALP: 'OH', ACTIVE: 1, BKCLASS: 'SM' } }],
      }),
    ];
    let calls = 0;
    const snapshot = await fetchFdicInstitutions({
      fetchImpl: () => {
        const body = pages[calls];
        calls += 1;
        if (body === undefined) throw new Error('extra page');
        return Promise.resolve(new Response(body, { status: 200 }));
      },
      signal: AbortSignal.timeout(1000),
      retrievedAt: RETRIEVED_AT,
      pageSize: 1,
    });
    expect(calls).toBe(2);
    expect(snapshot.requestCount).toBe(2);
    expect(snapshot.body.responses.map((response) => response.body)).toEqual(pages);
    expect(snapshot.body.responses[0]?.url).toContain('offset=0');
    expect(snapshot.body.responses[1]?.url).toContain('offset=1');
    expect(parseFdicInstitutions(snapshot.body).map((row) => row.id)).toEqual(['fdic:1', 'fdic:2']);
    const later = await fetchFdicInstitutions({
      fetchImpl: () => Promise.resolve(new Response(pages[0], { status: 200 })),
      signal: AbortSignal.timeout(1000),
      retrievedAt: '2026-11-10T12:00:00.000Z',
      pageSize: 2,
    });
    const again = await fetchFdicInstitutions({
      fetchImpl: () => Promise.resolve(new Response(pages[0], { status: 200 })),
      signal: AbortSignal.timeout(1000),
      retrievedAt: '2026-11-11T12:00:00.000Z',
      pageSize: 2,
    });
    expect(later.sha256).toBe(again.sha256);
    expect(later.body.retrievedAt).not.toBe(again.body.retrievedAt);
  });

  it('stops on an http error', async () => {
    await expect(
      fetchFdicInstitutions({
        fetchImpl: () => Promise.resolve(new Response('no', { status: 503 })),
        signal: AbortSignal.timeout(1000),
        retrievedAt: RETRIEVED_AT,
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toThrow('http_503');
  });

  it('checks one live row without printing the body', async () => {
    const ok = await checkInstitutionShape(() =>
      Promise.resolve(new Response(recorded, { status: 200 })),
    );
    expect(ok).toBe('fdic institutions shape ok');
    const missing = await checkInstitutionShape(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    expect(missing).toBe('fdic institutions shape meta.total');
    const down = await checkInstitutionShape(() =>
      Promise.resolve(new Response('no', { status: 503 })),
    );
    expect(down).toBe('fdic institutions shape http 503');
  });

  it('names the scheduled source', () => {
    const source = fdicInstitutionsSource(() => RETRIEVED_AT);
    expect(source.id).toBe('fdic-institutions');
    expect(source.domain).toBe('institutions');
    expect(source.kind).toBe('official_api');
  });
});
