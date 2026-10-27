// Spec §4 contract tests 4 and 6: one suite every DataGateway implementation must pass.
// Imported only by *.test.ts files.
import {
  BankMetrics,
  DocumentMeta,
  FactRecord,
  Institution,
  InsuranceRules,
  IsoDate,
  Product,
  SourceRegistryEntry,
  STAGE1_CATEGORIES,
  TaxTables,
  type DataGateway,
  type GatewayErrorCode,
  type PageOf,
} from '@fa/contracts';
import { SponsoredItem, SponsoredPlacement } from '@fa/contracts/ads';
import { describe, expect, it } from 'vitest';

const LONG_AGO = IsoDate.parse('2000-01-01');

async function walk<T>(load: (cursor?: string) => Promise<PageOf<T>>, limit: number): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 1000; guard += 1) {
    const page = await load(cursor);
    expect(page.items.length).toBeLessThanOrEqual(limit);
    all.push(...page.items);
    if (page.nextCursor === null) return all;
    cursor = page.nextCursor;
  }
  throw new Error('pagination did not terminate');
}

const rejectsWith = (p: Promise<unknown>, code: GatewayErrorCode): Promise<void> =>
  expect(p).rejects.toMatchObject({ name: 'GatewayError', code });

export function gatewayContract(name: string, create: () => DataGateway): void {
  describe(`${name} satisfies the DataGateway contract`, () => {
    const gw = create();

    it.each(STAGE1_CATEGORIES)('pages %s products without duplicates or gaps', async (category) => {
      const all = (await gw.listProducts({ category, limit: 100 })).items;
      const walked = await walk(
        (cursor) =>
          gw.listProducts({ category, limit: 7, ...(cursor === undefined ? {} : { cursor }) }),
        7,
      );
      expect(walked.map((p) => p.id)).toEqual(all.map((p) => p.id));
      expect(new Set(walked.map((p) => p.id)).size).toBe(walked.length);
      for (const p of walked) expect(Product.parse(p)).toEqual(p);
    });

    it('pages institutions and filters by kind and name', async () => {
      const walked = await walk(
        (cursor) => gw.listInstitutions({ limit: 6, ...(cursor === undefined ? {} : { cursor }) }),
        6,
      );
      expect(new Set(walked.map((i) => i.id)).size).toBe(walked.length);
      for (const i of walked) expect(Institution.parse(i)).toEqual(i);
      const unions = await gw.listInstitutions({ kind: 'credit_union', limit: 100 });
      expect(unions.items.every((i) => i.kind === 'credit_union')).toBe(true);
      const first = walked[0]?.name.slice(0, 4).toUpperCase() ?? '';
      const byName = await gw.listInstitutions({ q: first, limit: 100 });
      expect(byName.items.every((i) => i.name.toUpperCase().includes(first))).toBe(true);
    });

    it('rejects bad queries with validation_failed', async () => {
      await rejectsWith(gw.listProducts({ category: 'cd', limit: 0 }), 'validation_failed');
      await rejectsWith(gw.listProducts({ category: 'cd', cursor: 'abc' }), 'validation_failed');
      await rejectsWith(gw.listFacts({}), 'validation_failed');
    });

    it('returns not_found for unknown ids', async () => {
      await rejectsWith(gw.getInstitution('fdic:0'), 'not_found');
      await rejectsWith(gw.getProduct('prod_none'), 'not_found');
      await rejectsWith(gw.getDocument('doc_none'), 'not_found');
      await rejectsWith(gw.getBankMetrics('fdic:0'), 'not_found');
    });

    it('serves single records that pass their schemas', async () => {
      const [product] = (await gw.listProducts({ category: 'cd', limit: 1 })).items;
      expect(product).toBeDefined();
      const id = product?.id ?? '';
      expect(Product.parse(await gw.getProduct(id))).toEqual(product);
      const institution = await gw.getInstitution(product?.institutionId ?? '');
      expect(Institution.parse(institution).id).toBe(product?.institutionId);
    });

    it('honours asOf for bank metrics and insurance rules', async () => {
      const banks = await gw.listInstitutions({ kind: 'direct_bank', limit: 1 });
      const bankId = banks.items[0]?.id ?? '';
      expect(BankMetrics.parse(await gw.getBankMetrics(bankId)).institutionId).toBe(bankId);
      await rejectsWith(gw.getBankMetrics(bankId, LONG_AGO), 'not_found');
      expect(InsuranceRules.safeParse(await gw.getInsuranceRules()).success).toBe(true);
      await rejectsWith(gw.getInsuranceRules(LONG_AGO), 'not_found');
    });

    it('filters facts by document and serves their documents', async () => {
      const [anyFact] = await gw
        .listFacts({
          productId: (await gw.listProducts({ category: 'cd', limit: 100 })).items[0]?.id ?? '',
        })
        .catch(() => []);
      const documentId = anyFact?.documentId ?? 'doc_01';
      const facts = await gw.listFacts({ documentId });
      expect(facts.length).toBeGreaterThan(0);
      for (const f of facts) expect(FactRecord.parse(f).documentId).toBe(documentId);
      expect(DocumentMeta.parse(await gw.getDocument(documentId)).id).toBe(documentId);
    });

    it('serves reference data, sources and labeled ads per placement', async () => {
      const tables = await gw.getTaxTables(2026);
      expect(TaxTables.parse(tables).taxYear).toBe(2026);
      await rejectsWith(gw.getTaxTables(1999), 'not_found');
      for (const s of await gw.listSources()) expect(SourceRegistryEntry.parse(s)).toEqual(s);
      for (const placement of SponsoredPlacement.options) {
        const ads = await gw.listSponsored(placement);
        for (const ad of ads) expect(SponsoredItem.parse(ad).placement).toBe(placement);
      }
    });
  });
}
