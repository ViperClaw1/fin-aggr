import type { IsoDate } from '@fa/contracts';
import { queryOptions } from '@tanstack/react-query';
import { getGateway } from '@/shared/api';
import { STALE_TIME } from '@/shared/lib/query-client';

export const taxTablesQuery = (taxYear: number) =>
  queryOptions({
    queryKey: ['reference', 'taxTables', taxYear] as const,
    queryFn: () => getGateway().getTaxTables(taxYear),
    staleTime: STALE_TIME.taxTables,
  });

export const insuranceRulesQuery = (asOf?: IsoDate) =>
  queryOptions({
    queryKey: ['reference', 'insuranceRules', asOf ?? null] as const,
    queryFn: () => getGateway().getInsuranceRules(asOf),
    staleTime: STALE_TIME.insuranceRules,
  });
