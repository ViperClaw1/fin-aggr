// The data set's date for the footer, loaded at build time like the catalog (ADR-016 D1): inside
// 'use cache' it joins the static shell of every page.
import { DATASET_DOMAINS, type DatasetInfo } from '@fa/contracts';
import { datasetInfoQuery } from '@/entities/fact/queries';
import { CACHE_REVALIDATE, cacheFor } from '@/shared/api/cache-policy';
import { makeQueryClient } from '@/shared/lib/query-client';

export async function loadDataset(): Promise<DatasetInfo> {
  'use cache';
  cacheFor(CACHE_REVALIDATE.meta, ...DATASET_DOMAINS);
  return makeQueryClient().query(datasetInfoQuery());
}
