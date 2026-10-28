// Deterministic fixtures for the mock gateway and tests. Pure: same seed, same data (ADR-011).
import type {
  BankMetrics,
  DocumentMeta,
  FactRecord,
  Institution,
  IsoDate,
  InsuranceRules,
  Product,
  SourceRegistryEntry,
  TaxTables,
} from '@fa/contracts';
import type { SponsoredItem } from '@fa/contracts/ads';
import { generateBankMetrics } from './bank-metrics';
import { AS_OF } from './common';
import { documentPublishers, generateDocuments, generateFacts } from './documents';
import { generateInstitutions, TREASURY_STOREFRONT_PREFIX } from './institutions';
import { createRng } from './prng';
import { generateProducts } from './products';
import { generateTaxTables, insuranceRules, sources } from './reference';
import { sponsored } from './sponsored';

export { TREASURY_STOREFRONT_PREFIX };

export const DEFAULT_SEED = 20261025;
const RETRIEVAL_STREAM = 0x5eed;

export interface FixtureSet {
  /** the date the data set describes; no `retrievedAt` is later (ADR-016 D6) */
  asOf: IsoDate;
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
  // a separate stream: adding retrieval dates must not change any other generated value
  const retrieval = createRng(seed ^ RETRIEVAL_STREAM);
  const institutions = generateInstitutions(rng);
  const isStorefront = (i: Institution): boolean => i.id.startsWith(TREASURY_STOREFRONT_PREFIX);
  const publishers = documentPublishers(institutions.filter((i) => i.kind === 'direct_bank'));
  const products = generateProducts(rng, {
    depositIssuers: institutions.filter((i) => !isStorefront(i)),
    treasuryIssuers: institutions.filter(isStorefront),
    documents: publishers,
    retrieval,
  });
  const documents = generateDocuments(rng, publishers);
  return {
    asOf: AS_OF,
    institutions,
    products,
    documents,
    facts: generateFacts(documents, products),
    bankMetrics: generateBankMetrics(rng, institutions, retrieval),
    taxTables: generateTaxTables(rng),
    insuranceRules: insuranceRules(),
    sources: sources(),
    sponsored: sponsored(),
  };
}
