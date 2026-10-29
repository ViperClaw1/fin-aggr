// The data set's date for the footer, loaded at build time like the catalog (ADR-016 D1): inside
// 'use cache' it joins the static shell of every page.
import type { DatasetInfo } from '@fa/contracts';
import { datasetInfoQuery } from '@/entities/fact/queries';
import { makeQueryClient } from '@/shared/lib/query-client';

export async function loadDataset(): Promise<DatasetInfo> {
  'use cache';
  return makeQueryClient().query(datasetInfoQuery());
}
