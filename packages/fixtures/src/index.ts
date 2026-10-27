// Deterministic fixtures for the mock gateway and tests. Pure: same seed, same data (ADR-011).
import type {
  BankMetrics,
  DocumentMeta,
  FactRecord,
  Institution,
  InsuranceRules,
  Product,
  SourceRegistryEntry,
  TaxTables,
} from '@fa/contracts';
import type { SponsoredItem } from '@fa/contracts/ads';
import { generateBankMetrics } from './bank-metrics';
import { documentPublishers, generateDocuments, generateFacts } from './documents';
import { generateInstitutions, TREASURY_STOREFRONT_PREFIX } from './institutions';
import { createRng } from './prng';
import { generateProducts } from './products';
import { generateTaxTables, insuranceRules, sources } from './reference';
import { sponsored } from './sponsored';

export { TREASURY_STOREFRONT_PREFIX };

export const DEFAULT_SEED = 20261025;

export interface FixtureSet {
  institutions: Institution[];
  products: Product[];
  documents: DocumentMeta[];
  facts: FactRecord[];
  bankMetrics: BankMetrics[];
  taxTables: TaxTables;
  insuranceRules: InsuranceRules;
  sources: SourceRegistryEntry[];
  sponsored: SponsoredItem[];
}

export function generateFixtures(seed: number): FixtureSet {
  const rng = createRng(seed);
  const institutions = generateInstitutions(rng);
  const isStorefront = (i: Institution): boolean => i.id.startsWith(TREASURY_STOREFRONT_PREFIX);
  const publishers = documentPublishers(institutions.filter((i) => i.kind === 'direct_bank'));
  const products = generateProducts(rng, {
    depositIssuers: institutions.filter((i) => !isStorefront(i)),
    treasuryIssuers: institutions.filter(isStorefront),
    documents: publishers,
  });
  const documents = generateDocuments(rng, publishers);
  return {
    institutions,
    products,
    documents,
    facts: generateFacts(documents, products),
    bankMetrics: generateBankMetrics(rng, institutions),
    taxTables: generateTaxTables(rng),
    insuranceRules: insuranceRules(),
    sources: sources(),
    sponsored: sponsored(),
  };
}
