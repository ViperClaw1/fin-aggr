import { describe, expect, it } from 'vitest';
import { thousandsFromDollars } from './amounts';
import { parseNcuaQuarter } from './parse';
import { dictionaryProblems, zipTables } from './zip';

const FOICU = [
  '"CU_NUMBER","CYCLE_DATE","CU_NAME","STATE"',
  '1,6/30/2026 0:00:00,"MORRIS SHEPPARD TEXARKANA","TX"',
].join('\n');

const FS220 = [
  '"CU_NUMBER","CYCLE_DATE","ACCT_010","ACCT_018"',
  '1,6/30/2026 0:00:00,13220539,11677454',
].join('\n');

describe('NCUA amounts', () => {
  it('converts whole dollars to thousands, half-up, without a float', () => {
    expect(thousandsFromDollars('13220539')).toBe(13221);
    expect(thousandsFromDollars('11677454')).toBe(11677);
    expect(thousandsFromDollars('0')).toBe(0);
  });
});

describe('NCUA quarter parse', () => {
  it('reads a charter, leaves the website empty, and omits ratio keys', () => {
    const [row] = parseNcuaQuarter({
      retrievedAt: '2026-11-13T12:00:00.000Z',
      sourceUrl: 'https://ncua.gov/files/publications/analysis/call-report-data-2026-06.zip',
      zip: zipTables({ 'FOICU.txt': FOICU, 'FS220.txt': FS220 }),
    });
    expect(row?.institution).toMatchObject({
      id: 'ncua:1',
      name: 'MORRIS SHEPPARD TEXARKANA',
      regulator: 'NCUA',
      kind: 'credit_union',
      hqState: 'TX',
      website: null,
    });
    expect(row?.institution.provenance.verification).toEqual({
      status: 'verified',
      verifiedAt: '2026-06-30',
      by: 'official_api',
    });
    expect(row?.institution.provenance.isMock).toBe(false);
    expect(row?.report?.report.totalAssetsUsdThousands).toBe(13221);
    expect(row?.report?.depositsUsdThousands).toBe(11677);
    expect(row?.report?.report.metrics).toEqual({});
    expect(row?.report?.report.asOf).toBe('2026-06-30');
  });

  it('refuses two cycle dates in one file', () => {
    const mixed = `${FS220}\n2,3/31/2026 0:00:00,1000,1000`;
    const directory = `${FOICU}\n2,3/31/2026 0:00:00,"SECOND","UT"`;
    expect(() =>
      parseNcuaQuarter({
        retrievedAt: '2026-11-13T12:00:00.000Z',
        sourceUrl: 'https://ncua.gov/files/publications/analysis/call-report-data-2026-06.zip',
        zip: zipTables({ 'FOICU.txt': directory, 'FS220.txt': mixed }),
      }),
    ).toThrow('mixed_quarter');
  });
});

describe('NCUA dictionary prefix', () => {
  it('accepts one account and the header without the rest of the quarter', () => {
    const zip = zipTables({
      'AcctDesc.txt': '"Account","AcctName"\n"Acct_010","TOTAL ASSETS"\n',
    });
    expect(dictionaryProblems(zip)).toEqual([]);
    expect(dictionaryProblems(Uint8Array.from([0, 1, 2, 3]))).toEqual(['magic']);
  });
});
