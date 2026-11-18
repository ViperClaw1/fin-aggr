// Pricing geography of bank offers (ADR-022).
import { describe, expect, it } from 'vitest';
import { BankMarket, Product } from './entities';

const provenance = {
  sourceId: 'src_mock',
  sourceUrl: 'https://example.com/source',
  retrievedAt: '2026-10-26T12:00:00Z',
  verification: { status: 'unverified' },
  isMock: true,
};

const product = {
  id: 'prod_cd_0001',
  institutionId: 'fdic:1',
  category: 'cd',
  name: '12-month CD',
  termMonths: 12,
  tierMode: 'whole_balance',
  tiers: [{ minBalance: 0, maxBalance: null, apy: '0.04' }],
  compounding: 'daily',
  minOpening: 50000,
  maxDeposit: null,
  earlyWithdrawal: { value: { kind: 'days_of_interest', days: 90 }, provenance },
  eligibility: { op: 'and', args: [] },
  taxTreatment: 'taxable',
  validFrom: '2026-10-01',
  validTo: null,
  provenance,
};

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown): boolean =>
  schema.safeParse(v).success;

describe('Product pricing scope (ADR-022)', () => {
  const market = {
    ...product,
    id: 'fdic-1-cd12--m-ny-metro',
    scope: 'market',
    marketId: 'ny-metro',
    provenance: { ...provenance, requestZip: '10001' },
  };
  const issues = (v: unknown): string[] =>
    Product.safeParse(v).error?.issues.map((i) => i.message) ?? [];

  it('reads a row without the new fields as a national online base rate', () => {
    expect(Product.parse(product)).toMatchObject({
      scope: 'national',
      marketId: null,
      channel: 'online',
      relationshipRate: false,
    });
  });
  it('accepts a market offer read for a ZIP', () => {
    expect(ok(Product, market)).toBe(true);
  });
  it('rejects a market offer without the ZIP the request carried', () => {
    expect(issues({ ...market, provenance })).toEqual([
      'market offer requires provenance.requestZip',
    ]);
  });
  it('rejects a market offer whose id lacks its market suffix', () => {
    expect(issues({ ...market, id: 'fdic-1-cd12' })).toEqual([
      'market offer id must end with its market suffix',
    ]);
  });
  it('rejects a market offer without a marketId', () => {
    expect(issues({ ...market, marketId: null })).toEqual(['market offer requires marketId']);
  });
  it('rejects a national offer that names a market or carries a market suffix', () => {
    expect(issues({ ...product, marketId: 'ny-metro' })).toEqual(['national offer has a marketId']);
    expect(issues({ ...product, id: 'fdic-1-cd12--m-ny' })).toEqual([
      'national id carries a market suffix',
    ]);
  });
  it('rejects a malformed requestZip and market id', () => {
    expect(ok(Product, { ...market, provenance: { ...provenance, requestZip: '1001' } })).toBe(
      false,
    );
    expect(ok(Product, { ...market, id: 'x--m-NY', marketId: 'NY' })).toBe(false);
  });
});

describe('BankMarket', () => {
  const row = {
    institutionId: 'fdic:1',
    marketId: 'ny-metro',
    zipPrefixes: ['100'],
    zips: [],
    representativeZip: '10001',
    verifiedAt: '2026-11-18',
  };
  it('accepts a market listed by prefix', () => {
    expect(ok(BankMarket, row)).toBe(true);
  });
  it('rejects a market with no ZIP and no prefix, and a four-digit prefix', () => {
    expect(ok(BankMarket, { ...row, zipPrefixes: [] })).toBe(false);
    expect(ok(BankMarket, { ...row, zipPrefixes: ['1000'] })).toBe(false);
  });
});
