// Loads the compare data at build time (ADR-016 D1). Inside 'use cache' the result joins the static
// shell and is passed to the table as props: the client never queries it, so it never loads the
// gateway, and the table renders into the static HTML. A failure fails the build, never an empty page.
import type { DatasetInfo, Id, Institution, ProductCategory, TaxTables } from '@fa/contracts';
import { datasetInfoQuery } from '@/entities/fact/queries';
import { institutionsQuery } from '@/entities/institution/queries';
import { productsQuery } from '@/entities/product/queries';
import { taxTablesQuery } from '@/entities/reference/queries';
import { TAX_YEAR } from '@/shared/config';
import { CACHE_REVALIDATE, cacheFor } from '@/shared/api/cache-policy';
import { makeQueryClient } from '@/shared/lib/query-client';
import { packCompareProducts, type CompareWire } from '../model/wire';

type InstitutionRow = Pick<Institution, 'id' | 'name' | 'kind' | 'partnerInstitutionIds'>;

export interface CompareData {
  products: CompareWire;
  /** issuers of this category, plus the partners the safety badge names */
  institutions: InstitutionRow[];
  dataset: DatasetInfo;
  /** for the after-tax ranking in the browser; the profile never reaches this request (ADR-004) */
  taxTables: TaxTables;
}

function shownInstitutions(
  products: { institutionId: Id }[],
  institutions: InstitutionRow[],
): InstitutionRow[] {
  const byId = new Map(institutions.map((i) => [i.id, i]));
  const keep = new Set(products.map((p) => p.institutionId));
  for (const id of keep) {
    for (const partner of byId.get(id)?.partnerInstitutionIds ?? []) keep.add(partner);
  }
  return institutions.filter((i) => keep.has(i.id));
}

export async function loadCompareData(category: ProductCategory): Promise<CompareData> {
  'use cache';
  cacheFor(
    CACHE_REVALIDATE.products,
    'institutions',
    'reference',
    category === 'treasury' ? 'treasury' : 'products',
  );
  const client = makeQueryClient();
  const [products, institutions, dataset, taxTables] = await Promise.all([
    client.query(productsQuery({ category })),
    // 40 institutions in the data set: one page
    client.query(institutionsQuery({ limit: 100 })),
    client.query(datasetInfoQuery()),
    client.query(taxTablesQuery(TAX_YEAR)),
  ]);
  const rows = institutions.items.map(({ id, name, kind, partnerInstitutionIds }) => ({
    id,
    name,
    kind,
    partnerInstitutionIds,
  }));
  return {
    products: packCompareProducts(products.items, category),
    institutions: shownInstitutions(products.items, rows),
    dataset,
    taxTables,
  };
}
