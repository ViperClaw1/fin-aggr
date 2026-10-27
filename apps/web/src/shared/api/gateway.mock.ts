// In-process mock gateway (ADR-005): fixtures from a seed, schema-checked responses, cursor
// pagination, deterministic latency and failure injection keyed by a hash of the request.
import {
  BankMetrics,
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
  type GatewayErrorCode,
  type PageOf,
} from '@fa/contracts';
import { SponsoredItem } from '@fa/contracts/ads';
import type { FixtureSet } from '@fa/fixtures';

export interface MockGatewayOptions {
  seed: number;
  /** `none` on the server, at build time and in tests; `simulated` (150–600 ms) in the browser. */
  latency: 'none' | 'simulated';
  /** Share of requests failing with a retryable `unavailable`, 0..1. */
  failureRate: number;
  /** Targeted scenarios for tests: this method always fails with this code. */
  failures?: Partial<Record<keyof DataGateway, GatewayErrorCode>>;
}

/** What the gateway needs from a contracts schema; keeps zod itself out of the app. */
interface Schema<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: Error };
}

const listOf = <T>(item: Schema<T>): Schema<T[]> => ({
  safeParse: (value) => {
    if (!Array.isArray(value)) return { success: false, error: new Error('expected an array') };
    const data: T[] = [];
    for (const v of value) {
      const r = item.safeParse(v);
      if (!r.success) return r;
      data.push(r.data);
    }
    return { success: true, data };
  },
});

const RETRYABLE: ReadonlySet<GatewayErrorCode> = new Set(['unavailable', 'rate_limited']);
const IS_DEV = process.env.NODE_ENV !== 'production';

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function notFound(what: string): never {
  throw new GatewayError('not_found', `${what} not found`, false);
}

function parseQuery<T>(schema: Schema<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new GatewayError('validation_failed', parsed.error.message, false);
  return parsed.data;
}

/** Parses the query inside the promise, so a bad query rejects instead of throwing. */
const withQuery = <Q, T>(schema: Schema<Q>, raw: unknown, run: (q: Q) => Promise<T>): Promise<T> =>
  Promise.resolve(raw).then((r) => run(parseQuery(schema, r)));

/** Cursor is the opaque offset of the next item. */
function paginate<T>(items: readonly T[], limit: number, cursor: string | undefined): PageOf<T> {
  if (cursor !== undefined && !/^\d+$/.test(cursor)) {
    throw new GatewayError('validation_failed', `Invalid cursor "${cursor}"`, false);
  }
  const start = cursor === undefined ? 0 : Number(cursor);
  const end = start + limit;
  return { items: items.slice(start, end), nextCursor: end < items.length ? String(end) : null };
}

type InstitutionFilter = ReturnType<typeof InstitutionQuery.parse>;
type ProductFilter = ReturnType<typeof ProductQuery.parse>;
type FactFilter = ReturnType<typeof FactQuery.parse>;

const institutionsMatching = (f: FixtureSet, q: InstitutionFilter): Institution[] => {
  const needle = q.q?.toLowerCase();
  return f.institutions.filter(
    (i) =>
      (q.kind === undefined || i.kind === q.kind) &&
      (needle === undefined || i.name.toLowerCase().includes(needle)),
  );
};

const productsMatching = (f: FixtureSet, q: ProductFilter): Product[] =>
  f.products.filter(
    (p) =>
      p.category === q.category &&
      (q.institutionId === undefined || p.institutionId === q.institutionId),
  );

const factsMatching = (f: FixtureSet, q: FactFilter): FactRecord[] =>
  f.facts.filter(
    (x) =>
      (q.documentId === undefined || x.documentId === q.documentId) &&
      (q.productId === undefined || x.productId === q.productId),
  );

type Respond = <T>(
  method: keyof DataGateway,
  args: readonly unknown[],
  schema: Schema<T>,
  produce: (f: FixtureSet) => unknown,
) => Promise<T>;

/** Latency, failure injection and response validation shared by every method. */
function createResponder(options: MockGatewayOptions): Respond {
  let data: Promise<FixtureSet> | undefined;
  // lazy import keeps fixtures out of the first-load bundle (AC-8)
  const fixtures = (): Promise<FixtureSet> =>
    (data ??= import('@fa/fixtures').then((m) => m.generateFixtures(options.seed)));

  return async (method, args, schema, produce) => {
    const hash = fnv1a(`${method}:${JSON.stringify(args)}`);
    if (options.latency === 'simulated') await sleep(150 + (hash % 451));
    const forced = options.failures?.[method];
    if (forced !== undefined) {
      throw new GatewayError(forced, `${method}: scenario`, RETRYABLE.has(forced));
    }
    if (hash % 10000 < options.failureRate * 10000) {
      throw new GatewayError('unavailable', `${method}: injected failure`, true);
    }
    const parsed = schema.safeParse(produce(await fixtures()));
    if (parsed.success) return parsed.data;
    // dev fails loudly; prod hides the broken payload behind a retryable error (spec §4)
    if (IS_DEV) throw new Error(`${method}: response violates its schema\n${parsed.error.message}`);
    throw new GatewayError('unavailable', `${method}: invalid response`, true);
  };
}

export function createMockGateway(options: MockGatewayOptions): DataGateway {
  const respond = createResponder(options);
  return {
    listInstitutions: (raw) =>
      withQuery(InstitutionQuery, raw, (q) =>
        respond('listInstitutions', [q], Page(Institution), (f) =>
          paginate(institutionsMatching(f, q), q.limit, q.cursor),
        ),
      ),
    getInstitution: (id) =>
      respond(
        'getInstitution',
        [id],
        Institution,
        (f) => f.institutions.find((i) => i.id === id) ?? notFound(`Institution ${id}`),
      ),
    getBankMetrics: (id, asOf) =>
      respond('getBankMetrics', [id, asOf], BankMetrics, (f) => {
        const m = f.bankMetrics.find((x) => x.institutionId === id);
        // the mock has one snapshot; an asOf before it has no data
        if (m === undefined || (asOf !== undefined && asOf < m.asOf))
          return notFound(`Metrics ${id}`);
        return m;
      }),
    listProducts: (raw) =>
      withQuery(ProductQuery, raw, (q) =>
        respond('listProducts', [q], Page(Product), (f) =>
          paginate(productsMatching(f, q), q.limit, q.cursor),
        ),
      ),
    getProduct: (id) =>
      respond(
        'getProduct',
        [id],
        Product,
        (f) => f.products.find((p) => p.id === id) ?? notFound(`Product ${id}`),
      ),
    getDocument: (id) =>
      respond(
        'getDocument',
        [id],
        DocumentMeta,
        (f) => f.documents.find((d) => d.id === id) ?? notFound(`Document ${id}`),
      ),
    listFacts: (raw) =>
      withQuery(FactQuery, raw, (q) =>
        respond('listFacts', [q], listOf(FactRecord), (f) => factsMatching(f, q)),
      ),
    getTaxTables: (taxYear) =>
      respond('getTaxTables', [taxYear], TaxTables, (f) =>
        f.taxTables.taxYear === taxYear ? f.taxTables : notFound(`Tax tables ${String(taxYear)}`),
      ),
    getInsuranceRules: (asOf) =>
      respond('getInsuranceRules', [asOf], InsuranceRules, (f) =>
        asOf !== undefined && asOf < f.insuranceRules.asOf
          ? notFound(`Insurance rules as of ${asOf}`)
          : f.insuranceRules,
      ),
    listSources: () => respond('listSources', [], listOf(SourceRegistryEntry), (f) => f.sources),
    listSponsored: (placement) =>
      respond('listSponsored', [placement], listOf(SponsoredItem), (f) =>
        f.sponsored.filter((s) => s.placement === placement),
      ),
  };
}
