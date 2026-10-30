// Banks at build time. cacheLife('days') is the cacheComponents stand-in for ISR: the `days`
// profile revalidates in the background after one day (Next.js cacheLife), matching the metrics
// response's one-day freshness. Colons in ids are rewritten for the route (Windows build paths).
import {
  compareRate,
  STAGE1_CATEGORIES,
  type DatasetInfo,
  type Fact,
  type Id,
  type Institution,
  type Product,
  type ProductCategory,
  type Rate,
} from '@fa/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { cacheLife } from 'next/cache';
import { datasetInfoQuery } from '@/entities/fact/queries';
import { institutionsQuery } from '@/entities/institution/queries';
import { headlineApy } from '@/entities/product';
import { productsQuery } from '@/entities/product/queries';
import { makeQueryClient } from '@/shared/lib/query-client';

export interface BankListItem {
  id: Id;
  name: string;
  kind: Institution['kind'];
  partners: { id: Id; name: string }[];
  productCount: number;
  bestApy: Fact<Rate> | null;
}

export interface BankListData {
  items: BankListItem[];
  dataset: DatasetInfo;
}

async function productsIn(client: QueryClient, category: ProductCategory): Promise<Product[]> {
  const page = await client.query(productsQuery({ category, limit: 100 }));
  return page.items;
}

function bestApy(products: readonly Product[]): Fact<Rate> | null {
  const best = products.reduce<Product | null>((top, product) => {
    if (top === null) return product;
    return compareRate(headlineApy(product), headlineApy(top)) > 0 ? product : top;
  }, null);
  if (best === null) return null;
  return { value: headlineApy(best), provenance: best.provenance };
}

export async function loadBankList(): Promise<BankListData> {
  'use cache';
  cacheLife('days');
  const client = makeQueryClient();
  const [institutions, dataset, groups] = await Promise.all([
    client.query(institutionsQuery({ limit: 100 })),
    client.query(datasetInfoQuery()),
    Promise.all(STAGE1_CATEGORIES.map((category) => productsIn(client, category))),
  ]);
  const products = groups.flat();
  const names = new Map(institutions.items.map((item) => [item.id, item.name]));
  const items = institutions.items.map((institution): BankListItem => {
    const own = products.filter((product) => product.institutionId === institution.id);
    return {
      id: institution.id,
      name: institution.name,
      kind: institution.kind,
      partners: institution.partnerInstitutionIds.flatMap((id) => {
        const name = names.get(id);
        return name === undefined ? [] : [{ id, name }];
      }),
      productCount: own.length,
      bestApy: bestApy(own),
    };
  });
  items.sort((a, b) => a.name.localeCompare(b.name, 'en-US'));
  return { items, dataset };
}
