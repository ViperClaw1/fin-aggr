import { Cents, Rate } from '@fa/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadProductFilters, productFiltersUrl, type ProductFilters } from './search-params';

const load = (query: string): ProductFilters => loadProductFilters(new URLSearchParams(query));
const DEFAULTS: ProductFilters = {
  term: [],
  kind: [],
  minApy: null,
  maxOpening: null,
  search: '',
  hide: null,
};

describe('parsing', () => {
  it('an empty query gives the defaults', () => {
    expect(load('')).toEqual(DEFAULTS);
  });
  it('reads every filter', () => {
    expect(
      load(
        'term=24,12&kind=credit_union,direct_bank&minApy=4.5&maxOpening=5000&search=ally&hide=ineligible',
      ),
    ).toEqual({
      term: [12, 24],
      kind: ['direct_bank', 'credit_union'],
      minApy: '0.045',
      maxOpening: 500000,
      search: 'ally',
      hide: 'ineligible',
    });
  });
  it.each([
    ['term', 'term=0,601,abc,-3,1.5', []],
    ['term duplicates and order', 'term=12,6,12,6', [6, 12]],
    [
      'term over the limit keeps the ten shortest',
      'term=11,10,9,8,7,6,5,4,3,2,1',
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    ],
    ['kind unknown values', 'kind=bank,fintech_partner,x', ['fintech_partner']],
  ] as const)('%s', (_, query, expected) => {
    const key = query.split('=')[0] as 'term' | 'kind';
    expect(load(query)[key]).toEqual(expected);
  });
  it.each([
    ['minApy=abc'],
    ['minApy=150'],
    ['minApy=-1'],
    ['minApy=4.123456789'],
    ['minApy=00000000004.5'],
    ['minApy=0'],
    ['minApy=0.000'],
    ['maxOpening=5000.50'],
    ['maxOpening=$5,000'],
    ['maxOpening=10000001'],
    ['maxOpening=-1'],
    ['hide=all'],
  ])('garbage becomes the default: %s', (query) => {
    expect(load(query)).toEqual(DEFAULTS);
  });
  it('accepts the bounds of maxOpening and minApy', () => {
    expect([load('maxOpening=0').maxOpening, load('maxOpening=10000000').maxOpening]).toEqual([
      0, 1000000000,
    ]);
    expect([load('minApy=0.001').minApy, load('minApy=100').minApy]).toEqual(['0.00001', '1']);
  });
  it('search is trimmed, capped at 80 and stays plain text', () => {
    const raw = `  <script>alert(1)</script>\u0007${'x'.repeat(100)}  `;
    const { search } = load(new URLSearchParams({ search: raw }).toString());
    expect(search).toHaveLength(80);
    expect(search.startsWith('<script>alert(1)</script>\u0007')).toBe(true);
    expect(load('search=%20%20').search).toBe('');
  });
});

describe('serializing', () => {
  it('leaves defaults out of the URL', () => {
    expect(productFiltersUrl('', DEFAULTS)).toBe('');
  });
  it('writes rates as percent and money as whole dollars', () => {
    expect(
      productFiltersUrl('', { minApy: Rate.parse('0.045'), maxOpening: Cents.parse(500000) }),
    ).toBe('?minApy=4.5&maxOpening=5000');
  });
  it('maxOpening with cents is written rounded down to whole dollars and reads back', () => {
    const url = productFiltersUrl('', { maxOpening: Cents.parse(50050) });
    expect([url, load(url.slice(1)).maxOpening]).toEqual(['?maxOpening=500', 50000]);
  });
  it('equal filters written in any order give the same link', () => {
    expect(productFiltersUrl('', load('term=24,12,12&kind=credit_union,direct_bank'))).toBe(
      productFiltersUrl('', load('kind=direct_bank,credit_union&term=12,24')),
    );
  });
  it('parse → serialize → parse is stable for any query', () => {
    const value = fc.oneof(
      fc.string(),
      fc.integer().map(String),
      fc.constantFrom('12,24', '4.5', 'ineligible'),
    );
    const query = fc.dictionary(
      fc.constantFrom('term', 'kind', 'minApy', 'maxOpening', 'search', 'hide'),
      value,
    );
    fc.assert(
      fc.property(query, (q) => {
        const once = load(new URLSearchParams(q).toString());
        const twice = load(productFiltersUrl('', once).replace(/^\?/, ''));
        expect(twice).toEqual(once);
      }),
    );
  });
});
