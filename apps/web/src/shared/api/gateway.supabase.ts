// Server read of the published dataset (ADR-019). The browser never loads this module.
import 'server-only';
import {
  BankMarket,
  BankMetrics,
  DatasetDomainInfo,
  DatasetInfo,
  type DatasetDomain,
  datasetRollup,
  DocumentMeta,
  FactQuery,
  FactRecord,
  GatewayError,
  Institution,
  InstitutionQuery,
  InsuranceRules,
  Page,
  Product,
  ProductQuery,
  SourceRegistryEntry,
  TaxTables,
  type DataGateway,
  type PageOf,
} from '@fa/contracts';
import { SponsoredItem, SponsoredPlacement } from '@fa/contracts/ads';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { many, maybe, one, parsed, raise } from './supabase-read';
import {
  bankMarketFrom,
  documentFrom,
  factFrom,
  institutionFrom,
  insuranceFrom,
  metricsFrom,
  offsetOf,
  page,
  productFrom,
  sourceFrom,
  sponsoredFrom,
  taxFrom,
} from './supabase-rows';

const INSTITUTION_COLUMNS =
  'id, name, regulator, kind, partner_institution_ids, hq_state, website, provenance';
// anon may not read verified_by (column grant in the ADR-022 migration)
const MARKET_COLUMNS = 'bank_id, market_id, zip_prefixes, zips, representative_zip, verified_at';

function db(): SupabaseClient {
  const url = process.env['SUPABASE_URL']?.trim();
  const key = process.env['SUPABASE_ANON_KEY']?.trim();
  if (url === undefined || url === '' || key === undefined || key === '') {
    throw new GatewayError('unavailable', 'SUPABASE_URL and SUPABASE_ANON_KEY are required', true);
  }
  return createClient(url, key, { auth: { persistSession: false } }) as SupabaseClient;
}

let client: SupabaseClient | undefined;
const supabase = (): SupabaseClient => {
  client ??= db();
  return client;
};

/** Current version of one domain. RLS already hides versions that are not current. */
async function currentVersionId(domain: string): Promise<unknown> {
  const row = await one(
    supabase().from('dataset_versions').select('id').eq('domain', domain).limit(1).single(),
  );
  return row['id'];
}

function institutionQuery(versionId: unknown, id: string) {
  return supabase()
    .from('institutions')
    .select(INSTITUTION_COLUMNS)
    .eq('version_id', versionId)
    .eq('id', id)
    .maybeSingle();
}

async function tiersFor(
  versionId: unknown,
  productId: unknown,
): Promise<Record<string, unknown>[]> {
  return many(
    supabase()
      .from('product_tiers_text')
      .select('ord, min_balance, max_balance, apy')
      .eq('version_id', versionId)
      .eq('product_id', productId)
      .order('ord'),
  );
}

async function productAt(row: Record<string, unknown>): Promise<Product> {
  const tiers = await tiersFor(row['version_id'], row['id']);
  return parsed(Product, productFrom(row, tiers), 'product');
}

/** Owner decision 2026-11-25: once a category has a real product, demo fixtures leave it. */
async function hasRealProduct(category: string): Promise<boolean> {
  const { count, error } = await supabase()
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category', category)
    .eq('provenance->>isMock', 'false');
  if (error) raise(error);
  return (count ?? 0) > 0;
}

async function listProducts(raw: unknown): Promise<PageOf<Product>> {
  const q = parsed(ProductQuery, raw, 'products');
  const start = offsetOf(q.cursor);
  let query = supabase()
    .from('products')
    .select('*')
    .eq('category', q.category)
    .order('id')
    .range(start, start + q.limit - 1);
  if (q.institutionId !== undefined) query = query.eq('institution_id', q.institutionId);
  if (await hasRealProduct(q.category)) query = query.eq('provenance->>isMock', 'false');
  const rows = await many(query);
  const items = await Promise.all(rows.map((row) => productAt(row)));
  return parsed(Page(Product), page(items, start, q.limit), 'products');
}

async function getProduct(id: string): Promise<Product> {
  const row = await one(supabase().from('products').select('*').eq('id', id).single());
  return productAt(row);
}

async function getDocument(id: string): Promise<DocumentMeta> {
  const row = await one(supabase().from('documents').select('*').eq('id', id).single());
  return parsed(DocumentMeta, documentFrom(row), 'document');
}

async function listFacts(raw: unknown): Promise<FactRecord[]> {
  const q = parsed(FactQuery, raw, 'facts');
  let query = supabase().from('facts').select('*').order('id');
  if (q.documentId !== undefined) query = query.eq('document_id', q.documentId);
  if (q.productId !== undefined) query = query.eq('product_id', q.productId);
  const rows = await many(query);
  return rows.map((row) => parsed(FactRecord, factFrom(row), 'fact'));
}

export function createSupabaseGateway(): DataGateway {
  return {
    listInstitutions: async (raw) => {
      const q = parsed(InstitutionQuery, raw, 'institutions');
      const start = offsetOf(q.cursor);
      // The directory is the institutions version. Fixture issuers live on the products version
      // and are reached only by getInstitution, so Ironwood does not sit in the FDIC list.
      const versionId = await currentVersionId('institutions');
      let query = supabase()
        .from('institutions')
        .select(INSTITUTION_COLUMNS)
        .eq('version_id', versionId)
        .order('id')
        .range(start, start + q.limit - 1);
      if (q.kind !== undefined) query = query.eq('kind', q.kind);
      if (q.q !== undefined) query = query.ilike('name', `%${q.q}%`);
      const rows = await many(query);
      const items = rows.map((row) => parsed(Institution, institutionFrom(row), 'institution'));
      return parsed(Page(Institution), page(items, start, q.limit), 'institutions');
    },
    getInstitution: async (id) => {
      const registry = await maybe(institutionQuery(await currentVersionId('institutions'), id));
      // issuers outside the registry hang on their products' version: demo banks, the Treasury
      const row =
        registry ??
        (await maybe(institutionQuery(await currentVersionId('products'), id))) ??
        (await maybe(institutionQuery(await currentVersionId('treasury'), id)));
      if (row === null) throw new GatewayError('not_found', `Institution ${id}`, false);
      return parsed(Institution, institutionFrom(row), 'institution');
    },
    getBankMetrics: async (id, asOf) => {
      let query = supabase()
        .from('bank_metrics')
        .select(
          'institution_id, as_of, total_assets_usd_thousands, metrics, balance_sheet_mix, provenance',
        )
        .eq('institution_id', id);
      query =
        asOf === undefined
          ? query.order('as_of', { ascending: false }).limit(1)
          : query.eq('as_of', asOf);
      const row = await one(query.single());
      return parsed(BankMetrics, metricsFrom(row), 'metrics');
    },
    listProducts,
    getProduct,
    listBankMarkets: async () =>
      (await many(supabase().from('bank_markets').select(MARKET_COLUMNS).order('bank_id'))).map(
        (row) => parsed(BankMarket, bankMarketFrom(row), 'bank market'),
      ),
    getDocument,
    listFacts,
    getTaxTables: (taxYear) => taxTables(taxYear),
    getInsuranceRules: (asOf) => insurance(asOf),
    listSources: async () => {
      const rows = await many(
        supabase()
          .from('sources')
          .select('id, name, url, kind, license, last_updated_at, notes')
          .order('id'),
      );
      return rows.map((row) => parsed(SourceRegistryEntry, sourceFrom(row), 'source'));
    },
    listSponsored: async (placement) => {
      const where = parsed(SponsoredPlacement, placement, 'placement');
      const rows = await many(
        supabase().schema('ads').from('sponsored_items').select('*').eq('placement', where),
      );
      return rows.map((row) => parsed(SponsoredItem, sponsoredFrom(row), 'sponsored'));
    },
    getDatasetInfo: () => datasetInfo(),
  };
}

async function taxTables(taxYear: number): Promise<TaxTables> {
  const table = await one(
    supabase()
      .from('tax_tables')
      .select('version_id, tax_year, provenance, states_provenance')
      .eq('tax_year', taxYear)
      .single(),
  );
  const versionId = table['version_id'];
  const [brackets, states] = await Promise.all([
    many(
      supabase()
        .from('tax_brackets_text')
        .select('filing_status, ord, up_to, rate')
        .eq('version_id', versionId)
        .eq('tax_year', taxYear),
    ),
    many(
      supabase()
        .from('state_tax_rates_text')
        .select('state_code, assumed_marginal_rate, provenance')
        .eq('version_id', versionId)
        .eq('tax_year', taxYear),
    ),
  ]);
  return parsed(TaxTables, taxFrom(table, brackets, states), 'tax');
}

async function insurance(asOf: string | undefined): Promise<InsuranceRules> {
  const row = await one(supabase().from('insurance_rules').select('*').limit(1).single());
  if (asOf !== undefined && asOf < String(row['as_of'])) {
    throw new GatewayError('not_found', `Insurance rules as of ${asOf}`, false);
  }
  const limits = await many(
    supabase()
      .from('insurance_limits')
      .select('regulator, limit_per_owner')
      .eq('version_id', row['version_id']),
  );
  return parsed(InsuranceRules, insuranceFrom(row, limits), 'insurance');
}

async function datasetInfo(): Promise<DatasetInfo> {
  const rows = await many(supabase().from('dataset_versions').select('domain, as_of, is_mock'));
  const domains = {
    institutions: domainOf(rows, 'institutions'),
    bank_metrics: domainOf(rows, 'bank_metrics'),
    products: domainOf(rows, 'products'),
    treasury: domainOf(rows, 'treasury'),
    reference: domainOf(rows, 'reference'),
    par_yields: domainOf(rows, 'par_yields'),
    national_rates: domainOf(rows, 'national_rates'),
    documents: domainOf(rows, 'documents'),
    bank_products: domainOf(rows, 'bank_products'),
  };
  return parsed(DatasetInfo, { ...datasetRollup(domains), domains }, 'dataset');
}

function domainOf(rows: Record<string, unknown>[], domain: DatasetDomain) {
  const row = rows.find((item) => item['domain'] === domain);
  if (row === undefined)
    throw new GatewayError('unavailable', `no current ${domain} version`, true);
  return parsed(DatasetDomainInfo, { asOf: row['as_of'], isMock: row['is_mock'] }, domain);
}
