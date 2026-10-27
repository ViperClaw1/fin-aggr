import {
  BankMetrics,
  DocumentMeta,
  FactRecord,
  Institution,
  InsuranceRules,
  Product,
  SourceRegistryEntry,
  TaxTables,
} from '@fa/contracts';
import { SponsoredItem } from '@fa/contracts/ads';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, generateFixtures } from './index';

describe('every fixture parses with its schema', () => {
  const f = generateFixtures(DEFAULT_SEED);
  it.each([
    ['institutions', Institution, f.institutions],
    ['products', Product, f.products],
    ['documents', DocumentMeta, f.documents],
    ['facts', FactRecord, f.facts],
    ['bankMetrics', BankMetrics, f.bankMetrics],
    ['sources', SourceRegistryEntry, f.sources],
    ['sponsored', SponsoredItem, f.sponsored],
  ] as const)('%s', (_name, schema, items) => {
    for (const item of items) expect(schema.parse(item)).toEqual(item);
  });
  it('reference tables', () => {
    expect(TaxTables.parse(f.taxTables)).toEqual(f.taxTables);
    expect(InsuranceRules.parse(f.insuranceRules)).toEqual(f.insuranceRules);
  });
});

describe('generateFixtures', () => {
  it('is deterministic for a seed', () => {
    expect(generateFixtures(DEFAULT_SEED)).toEqual(generateFixtures(DEFAULT_SEED));
  });

  it('differs between seeds', () => {
    const a = generateFixtures(1);
    const b = generateFixtures(2);
    expect(a.institutions.map((i) => i.id)).not.toEqual(b.institutions.map((i) => i.id));
    expect(a.products.map((p) => p.tiers)).not.toEqual(b.products.map((p) => p.tiers));
  });

  it('returns independent copies of shared constants', () => {
    const a = generateFixtures(DEFAULT_SEED);
    a.sources.length = 0;
    expect(generateFixtures(DEFAULT_SEED).sources.length).toBeGreaterThan(0);
  });
});
