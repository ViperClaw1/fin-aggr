// Loads the compare data at build time (ADR-016 D1). Inside 'use cache' the result joins the static
// shell and is passed to the table as props: the client never queries it, so it never loads the
// gateway, and the table renders into the static HTML. A failure fails the build, never an empty page.
import type { DatasetInfo, ProductCategory, TaxTables } from '@fa/contracts';
import { datasetInfoQuery } from '@/entities/fact/queries';
import { institutionById } from '@/entities/institution/queries';
import { productsQuery } from '@/entities/product/queries';
import { taxTablesQuery } from '@/entities/reference/queries';
import { TAX_YEAR } from '@/shared/config';
import { CACHE_REVALIDATE, cacheFor } from '@/shared/api/cache-policy';
import { makeQueryClient } from '@/shared/lib/query-client';
import { issuersFor, type Issuer } from '../model/issuers';
import { packCompareProducts, type CompareWire } from '../model/wire';

export interface CompareData {
  products: CompareWire;
  /** issuers of this category, plus the partners the safety badge names */
  institutions: Issuer[];
  dataset: DatasetInfo;
  /** for the after-tax ranking in the browser; the profile never reaches this request (ADR-004) */
  taxTables: TaxTables;
}

export async function loadCompareData(category: ProductCategory): Promise<CompareData> {
  'use cache';
  cacheFor(
    CACHE_REVALIDATE.products,
    'institutions',
    'reference',
    category === 'treasury' ? 'treasury' : 'products',
    ...(category === 'treasury' ? [] : (['bank_products'] as const)),
  );
  const client = makeQueryClient();
  const [products, dataset, taxTables] = await Promise.all([
    client.query(productsQuery({ category })),
    client.query(datasetInfoQuery()),
    client.query(taxTablesQuery(TAX_YEAR)),
  ]);
  const institutions = await issuersFor(
    products.items.map((product) => product.institutionId),
    (id) => institutionById(client, id),
  );
  return {
    products: packCompareProducts(products.items, category),
    institutions,
    dataset,
    taxTables,
  };
}
