// Loads the compare data at build time (ADR-016 D1). Inside 'use cache' the result joins the static
// shell and is passed to the table as props: the client never queries it, so it never loads the
// gateway, and the table renders into the static HTML. A failure fails the build, never an empty page.
import type { DatasetInfo, Institution, Product, ProductCategory, TaxTables } from '@fa/contracts';
import { datasetInfoQuery } from '@/entities/fact/queries';
import { institutionsQuery } from '@/entities/institution/queries';
import { productsQuery } from '@/entities/product/queries';
import { taxTablesQuery } from '@/entities/reference/queries';
import { TAX_YEAR } from '@/shared/config';
import { makeQueryClient } from '@/shared/lib/query-client';

export interface CompareData {
  products: Product[];
  /** only what the table reads, to keep the page payload small */
  institutions: Pick<Institution, 'id' | 'name' | 'kind'>[];
  dataset: DatasetInfo;
  /** for the after-tax ranking in the browser; the profile never reaches this request (ADR-004) */
  taxTables: TaxTables;
}

export async function loadCompareData(category: ProductCategory): Promise<CompareData> {
  'use cache';
  const client = makeQueryClient();
  const [products, institutions, dataset, taxTables] = await Promise.all([
    client.query(productsQuery({ category })),
    // 40 institutions in the data set: one page
    client.query(institutionsQuery({ limit: 100 })),
    client.query(datasetInfoQuery()),
    client.query(taxTablesQuery(TAX_YEAR)),
  ]);
  return {
    products: products.items,
    institutions: institutions.items.map(({ id, name, kind }) => ({ id, name, kind })),
    dataset,
    taxTables,
  };
}
