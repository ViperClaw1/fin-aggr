import {
  GatewayError,
  normalizeInstitutionQuery,
  type DataGateway,
  type Id,
  type Institution,
  type IsoDate,
} from '@fa/contracts';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { getGateway } from '@/shared/api';
import { STALE_TIME } from '@/shared/lib/query-client';

type ListInput = Parameters<DataGateway['listInstitutions']>[0];

export const institutionsQuery = (q: ListInput) =>
  queryOptions({
    // defaults applied, so equal requests share one cache entry
    queryKey: ['institutions', 'list', normalizeInstitutionQuery(q)] as const,
    queryFn: () => getGateway().listInstitutions(q),
    staleTime: STALE_TIME.institutions,
  });

export const institutionQuery = (id: Id) =>
  queryOptions({
    queryKey: ['institutions', 'detail', id] as const,
    queryFn: () => getGateway().getInstitution(id),
    staleTime: STALE_TIME.institutions,
  });

/** null when the gateway has no institution with this id. A missing id is not retried. */
export async function institutionById(client: QueryClient, id: Id): Promise<Institution | null> {
  try {
    return await client.query(institutionQuery(id));
  } catch (error) {
    if (error instanceof GatewayError && error.code === 'not_found') return null;
    throw error;
  }
}

export const bankMetricsQuery = (id: Id, asOf?: IsoDate) =>
  queryOptions({
    queryKey: ['institutions', 'metrics', id, asOf ?? null] as const,
    queryFn: () => getGateway().getBankMetrics(id, asOf),
    staleTime: STALE_TIME.bankMetrics,
  });
