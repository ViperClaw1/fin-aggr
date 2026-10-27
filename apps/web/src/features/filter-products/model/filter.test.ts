// Synthetic products: this feature may not reach shared/api, tests included (profile-stays-local).
import { Cents, Product, Rate } from '@fa/contracts';
import type { RankedProduct } from '@fa/engine';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { filterProducts, filterRanked, type InstitutionIndex } from './filter';
import type { ProductFilters } from './search-params';

type Filters = Omit<ProductFilters, 'hide'>;
const NONE: Filters = { term: [], kind: [], minApy: null, maxOpening: null, search: '' };

const PROVENANCE = {
  sourceId: 'test',
  sourceUrl: 'https://example.com/test',
  retrievedAt: '2026-10-01T00:00:00Z',
  verification: { status: 'unverified' },
  isMock: true,
};
type Row = [
  id: string,
  institutionId: string,
  name: string,
  term: number | null,
  apys: string[],
  minOpening: number,
];
function product(...[id, institutionId, name, term, apys, minOpening]: Row): Product {
  return Product.parse({
    id,
    institutionId,
    category: term === null ? 'savings' : 'cd',
    name,
    termMonths: term,
    tierMode: 'whole_balance',
    tiers: apys.map((apy, i) => ({
      minBalance: i * 100000,
      maxBalance: i === apys.length - 1 ? null : i * 100000 + 99999,
      apy,
    })),
    compounding: 'monthly',
    minOpening,
    maxDeposit: null,
    earlyWithdrawal: { value: { kind: 'none' }, provenance: PROVENANCE },
    eligibility: { op: 'and', args: [] },
    taxTreatment: 'taxable',
    validFrom: '2026-10-01',
    validTo: null,
    provenance: PROVENANCE,
  });
}

const PRODUCTS = [
  product('p1', 'fdic:1', '12-Month CD', 12, ['0.045'], 50000),
  product('p2', 'fdic:1', '6-Month CD', 6, ['0.04', '0.05'], 0),
  product('p3', 'ncua:2', '24-Month CD', 24, ['0.05'], 100000),
  product('p4', 'ncua:2', 'High-Yield Savings', null, ['0.042'], 0),
  product('p5', 'fin:3', 'Tiered Savings', null, ['0.03', '0.048'], 2500),
  product('p6', 'fdic:9', 'Orphan CD', 12, ['0.06'], 0),
];
const INDEX: InstitutionIndex = new Map([
  ['fdic:1', { name: 'Harbor Bank', kind: 'direct_bank' }],
  ['ncua:2', { name: 'Valley Credit Union', kind: 'credit_union' }],
  ['fin:3', { name: 'Spark Savings', kind: 'fintech_partner' }],
]);

const ids = (f: Partial<Filters>, products = PRODUCTS): string[] =>
  filterProducts(products, { ...NONE, ...f }, INDEX).map((p) => p.id);

describe('filterProducts', () => {
  it('no filters keep every product of a known institution, in order', () => {
    expect(ids({})).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });
  it('term keeps the listed terms and drops products without a term', () => {
    expect(ids({ term: [6, 12] })).toEqual(['p1', 'p2']);
  });
  it('kind matches the issuing institution', () => {
    expect(ids({ kind: ['credit_union', 'fintech_partner'] })).toEqual(['p3', 'p4', 'p5']);
  });
  it('minApy compares the highest tier, the bound included', () => {
    expect(ids({ minApy: Rate.parse('0.048') })).toEqual(['p2', 'p3', 'p5']);
    expect(ids({ minApy: Rate.parse('0.0500') })).toEqual(['p2', 'p3']);
  });
  it('maxOpening keeps products whose minimum opening fits, the bound included', () => {
    expect(ids({ maxOpening: Cents.parse(50000) })).toEqual(['p1', 'p2', 'p4', 'p5']);
    expect(ids({ maxOpening: Cents.parse(0) })).toEqual(['p2', 'p4']);
  });
  it('search is case-insensitive over product and institution names', () => {
    expect(ids({ search: 'harbor' })).toEqual(['p1', 'p2']);
    expect(ids({ search: 'SAVINGS' })).toEqual(['p4', 'p5']);
    expect(ids({ search: 'no such bank' })).toEqual([]);
  });
  it('filters combine', () => {
    expect(ids({ term: [12, 24], minApy: Rate.parse('0.05') })).toEqual(['p3']);
  });
  it('does not mutate the input', () => {
    const copy = structuredClone(PRODUCTS);
    ids({ term: [6] });
    expect(PRODUCTS).toEqual(copy);
  });
});

const filtersArb: fc.Arbitrary<Filters> = fc.record({
  term: fc.subarray([6, 12, 24, 60]),
  kind: fc.subarray(['direct_bank', 'credit_union', 'fintech_partner'] as const),
  minApy: fc.option(fc.constantFrom('0', '0.042', '0.045', '0.05').map((r) => Rate.parse(r))),
  maxOpening: fc.option(fc.constantFrom(0, 2500, 50000).map((c) => Cents.parse(c))),
  search: fc.constantFrom('', 'cd', 'savings', 'bank'),
});

describe('filterProducts properties', () => {
  it('returns a subset of the input in the input order', () => {
    fc.assert(
      fc.property(filtersArb, (f) => {
        const order = ids(f).map((id) => PRODUCTS.findIndex((p) => p.id === id));
        expect(order).toEqual([...order].sort((a, b) => a - b));
      }),
    );
  });
  it('is idempotent and two filters commute', () => {
    fc.assert(
      fc.property(filtersArb, filtersArb, (a, b) => {
        const after = (f: Filters, products: readonly Product[]): Product[] =>
          filterProducts(products, f, INDEX);
        const onceA = after(a, PRODUCTS);
        expect(after(a, onceA)).toEqual(onceA);
        expect(after(b, onceA)).toEqual(after(a, after(b, PRODUCTS)));
      }),
    );
  });
});

describe('filterRanked', () => {
  const ranked = (['eligible', 'needs_profile', 'ineligible'] as const).map(
    (group, i) =>
      ({
        productId: `p${String(i)}`,
        group,
        rank: group === 'eligible' ? 1 : null,
      }) as RankedProduct,
  );
  it('hides only the ineligible group and keeps ranks', () => {
    expect(filterRanked(ranked, 'ineligible').map((r) => [r.productId, r.rank])).toEqual([
      ['p0', 1],
      ['p1', null],
    ]);
  });
  it('without hide returns a copy of everything', () => {
    const out = filterRanked(ranked, null);
    expect([out, out === ranked]).toEqual([ranked, false]);
  });
});
