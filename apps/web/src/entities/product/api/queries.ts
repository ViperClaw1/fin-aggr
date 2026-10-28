import { normalizeProductQuery, type DataGateway, type Id } from '@fa/contracts';
import { queryOptions } from '@tanstack/react-query';
import { getGateway } from '@/shared/api';
import { STALE_TIME } from '@/shared/lib/query-client';

type ListInput = Parameters<DataGateway['listProducts']>[0];

export const productsQuery = (q: ListInput) =>
  queryOptions({
    // defaults applied, so equal requests share one cache entry
    queryKey: ['products', 'list', normalizeProductQuery(q)] as const,
    queryFn: () => getGateway().listProducts(q),
    staleTime: STALE_TIME.products,
  });

export const productQuery = (id: Id) =>
  queryOptions({
    queryKey: ['products', 'detail', id] as const,
    queryFn: () => getGateway().getProduct(id),
    staleTime: STALE_TIME.products,
  });
