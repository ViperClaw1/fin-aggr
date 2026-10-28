// One set of query options for the server prefetch and the client (ADR-016 D1): equal keys, so the
// client finds the hydrated data. The data is as fresh as the page it came with, so the client
// never refetches it (a refetch would load the gateway); the page itself is rebuilt to refresh it.
import type { ProductCategory } from '@fa/contracts';
import { institutionsQuery } from '@/entities/institution/queries';
import { productsQuery } from '@/entities/product/queries';

export const compareProductsQuery = (category: ProductCategory) => ({
  ...productsQuery({ category }),
  staleTime: Infinity,
});

/** 40 institutions in the data set: one page. */
export const compareInstitutionsQuery = () => ({
  ...institutionsQuery({ limit: 100 }),
  staleTime: Infinity,
});
