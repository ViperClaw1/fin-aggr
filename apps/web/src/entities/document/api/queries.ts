import type { Id } from '@fa/contracts';
import { queryOptions } from '@tanstack/react-query';
import { getGateway } from '@/shared/api';
import { STALE_TIME } from '@/shared/lib/query-client';

export const documentQuery = (id: Id) =>
  queryOptions({
    queryKey: ['documents', id] as const,
    queryFn: () => getGateway().getDocument(id),
    staleTime: STALE_TIME.documents,
  });
