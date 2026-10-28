// Loads the compare data at build time (ADR-016 D1) with the client's own query options. Inside
// 'use cache' the result joins the static shell, so it must be serializable: dehydrate() gives
// plain objects and drops failed queries (only `success` dehydrates), which the client retries.
import { dehydrate, type DehydratedState } from '@tanstack/react-query';
import type { ProductCategory } from '@fa/contracts';
import { makeQueryClient } from '@/shared/lib/query-client';
import { compareInstitutionsQuery, compareProductsQuery } from '../model/queries';
import { datasetInfoQuery } from '@/entities/fact/queries';

export async function prefetchCompare(category: ProductCategory): Promise<DehydratedState> {
  'use cache';
  const client = makeQueryClient();
  // a failure stays out of the dehydrated state (see above), so it is swallowed here
  const skip = (): undefined => undefined;
  await Promise.all([
    client.query(compareProductsQuery(category)).catch(skip),
    client.query(compareInstitutionsQuery()).catch(skip),
    client.query(datasetInfoQuery()).catch(skip),
  ]);
  return dehydrate(client);
}
