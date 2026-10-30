// Product page data at build time (ADR-016 D1). 'use cache' joins the static shell: the client
// never queries, so it never loads the gateway. An unknown id is null (the page calls notFound).
import {
  GatewayError,
  STAGE1_CATEGORIES,
  type DatasetInfo,
  type FactRecord,
  type Id,
  type Institution,
  type Product,
  type TaxTables,
} from '@fa/contracts';
import { cacheLife } from 'next/cache';
import { datasetInfoQuery, factsQuery } from '@/entities/fact/queries';
import { institutionQuery, institutionsQuery } from '@/entities/institution/queries';
import { productQuery, productsQuery } from '@/entities/product/queries';
import { taxTablesQuery } from '@/entities/reference/queries';
import { TAX_YEAR } from '@/shared/config';
import { makeQueryClient } from '@/shared/lib/query-client';

interface ProductPartner {
  id: Id;
  name: string;
}

export interface ProductData {
  product: Product;
  institution: Pick<Institution, 'id' | 'name' | 'kind'>;
  partners: ProductPartner[];
  /** document facts for this product; often empty (only some products carry them) */
  facts: FactRecord[];
  dataset: DatasetInfo;
  taxTables: TaxTables;
}

export async function loadProductParams(): Promise<{ id: string }[]> {
  const client = makeQueryClient();
  const pages = await Promise.all(
    STAGE1_CATEGORIES.map((category) => client.query(productsQuery({ category, limit: 100 }))),
  );
  return pages.flatMap((page) => page.items.map((product) => ({ id: product.id })));
}

export async function loadProductData(id: Id): Promise<ProductData | null> {
  'use cache';
  cacheLife('max');
  const client = makeQueryClient();
  try {
    const product = await client.query(productQuery(id));
    const [institution, facts, institutions, dataset, taxTables] = await Promise.all([
      client.query(institutionQuery(product.institutionId)),
      client.query(factsQuery({ productId: id })),
      client.query(institutionsQuery({ limit: 100 })),
      client.query(datasetInfoQuery()),
      client.query(taxTablesQuery(TAX_YEAR)),
    ]);
    const byId = new Map(institutions.items.map((item) => [item.id, item.name]));
    return {
      product,
      institution: { id: institution.id, name: institution.name, kind: institution.kind },
      partners: institution.partnerInstitutionIds.flatMap((partnerId) => {
        const name = byId.get(partnerId);
        return name === undefined ? [] : [{ id: partnerId, name }];
      }),
      facts,
      dataset,
      taxTables,
    };
  } catch (error) {
    if (error instanceof GatewayError && error.code === 'not_found') return null;
    throw error;
  }
}
