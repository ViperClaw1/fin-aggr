import type { DataGateway } from '@fa/contracts';
import { queryOptions } from '@tanstack/react-query';
import { getGateway } from '@/shared/api';
import { STALE_TIME } from '@/shared/lib/query-client';

type ListInput = Parameters<DataGateway['listFacts']>[0];

export const factsQuery = (q: ListInput) =>
  queryOptions({
    // no defaults in FactQuery: the request is the key
    queryKey: ['facts', q] as const,
    queryFn: () => getGateway().listFacts(q),
    staleTime: STALE_TIME.facts,
  });

/** The source registry, for SourceCitation. */
export const sourcesQuery = () =>
  queryOptions({
    queryKey: ['sources'] as const,
    queryFn: () => getGateway().listSources(),
    staleTime: STALE_TIME.sources,
  });
