// One bank at build time. cacheLife('days'): background refresh after one day (see bank-search).
import {
  GatewayError,
  STAGE1_CATEGORIES,
  type BankMetrics,
  type DatasetInfo,
  type Id,
  type Institution,
  type Product,
  type ProductCategory,
} from '@fa/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { cacheLife } from 'next/cache';
import { datasetInfoQuery } from '@/entities/fact/queries';
import {
  bankMetricsQuery,
  institutionQuery,
  institutionsQuery,
} from '@/entities/institution/queries';
import { productsQuery } from '@/entities/product/queries';
import { bankParam } from '@/shared/lib/bank-param';
import { makeQueryClient } from '@/shared/lib/query-client';

export interface BankDetail {
  institution: Pick<Institution, 'id' | 'name' | 'kind' | 'regulator' | 'website'>;
  partners: { id: Id; name: string }[];
  /** null when the gateway has no call report; the page shows n/a, never a zero */
  metrics: BankMetrics | null;
  products: Product[];
  dataset: DatasetInfo;
}

async function productsOf(
  client: QueryClient,
  category: ProductCategory,
  institutionId: Id,
): Promise<Product[]> {
  const page = await client.query(productsQuery({ category, institutionId, limit: 100 }));
  return page.items;
}

export async function loadBank(id: Id): Promise<BankDetail | null> {
  'use cache';
  cacheLife('days');
  const client = makeQueryClient();
  try {
    const institution = await client.query(institutionQuery(id));
    const [institutions, dataset, metrics, groups] = await Promise.all([
      client.query(institutionsQuery({ limit: 100 })),
      client.query(datasetInfoQuery()),
      client.query(bankMetricsQuery(id)).catch((error: unknown) => {
        if (error instanceof GatewayError && error.code === 'not_found') return null;
        throw error;
      }),
      Promise.all(STAGE1_CATEGORIES.map((category) => productsOf(client, category, id))),
    ]);
    const names = new Map(institutions.items.map((item) => [item.id, item.name]));
    return {
      institution: {
        id: institution.id,
        name: institution.name,
        kind: institution.kind,
        regulator: institution.regulator,
        website: institution.website,
      },
      partners: institution.partnerInstitutionIds.flatMap((partnerId) => {
        const name = names.get(partnerId);
        return name === undefined ? [] : [{ id: partnerId, name }];
      }),
      metrics,
      products: groups.flat(),
      dataset,
    };
  } catch (error) {
    if (error instanceof GatewayError && error.code === 'not_found') return null;
    throw error;
  }
}

export async function loadBankParams(): Promise<{ id: string }[]> {
  const client = makeQueryClient();
  const page = await client.query(institutionsQuery({ limit: 100 }));
  return page.items.map((item) => ({ id: bankParam(item.id) }));
}
