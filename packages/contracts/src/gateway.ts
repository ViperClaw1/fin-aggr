// The data source boundary (ADR-005). Never imports profile.ts (ADR-004).
import type { z } from 'zod';
import type { SponsoredItem, SponsoredPlacement } from './ads';
import type { BankMetrics, DocumentMeta, FactRecord, Institution, Product } from './entities';
import type { Id, IsoDate } from './primitives';
import type { FactQuery, InstitutionQuery, PageOf, ProductQuery } from './queries';
import type { InsuranceRules, SourceRegistryEntry, TaxTables } from './reference';

export type GatewayErrorCode =
  'not_found' | 'validation_failed' | 'rate_limited' | 'unavailable' | 'not_implemented';

export class GatewayError extends Error {
  constructor(
    readonly code: GatewayErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export interface DataGateway {
  listInstitutions(q: z.input<typeof InstitutionQuery>): Promise<PageOf<Institution>>;
  getInstitution(id: Id): Promise<Institution>;
  getBankMetrics(id: Id, asOf?: IsoDate): Promise<BankMetrics>;
  listProducts(q: z.input<typeof ProductQuery>): Promise<PageOf<Product>>;
  getProduct(id: Id): Promise<Product>;
  getDocument(id: Id): Promise<DocumentMeta>;
  listFacts(q: z.input<typeof FactQuery>): Promise<FactRecord[]>;
  getTaxTables(taxYear: number): Promise<TaxTables>;
  getInsuranceRules(asOf?: IsoDate): Promise<InsuranceRules>;
  listSources(): Promise<SourceRegistryEntry[]>;
  listSponsored(placement: SponsoredPlacement): Promise<SponsoredItem[]>;
}
