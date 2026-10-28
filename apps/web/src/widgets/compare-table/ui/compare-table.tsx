'use client';

// Minimal compare table for ADR-016 D1: products, institutions and the data set date come
// hydrated from the server, so the first render makes no gateway call. Filters are read from the
// URL and run in memory. The filter form, ranking by profile and row summaries arrive in E5.
import { compareRate, formatUsd, type Product, type ProductCategory } from '@fa/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { FactValue, useFreshnessNow } from '@/entities/fact';
import { headlineApy } from '@/entities/product';
import {
  filterProducts,
  useProductFilters,
  type InstitutionIndex,
} from '@/features/filter-products';
import { DataTable, type Column } from '@/shared/ui/data-table';
import { RateValue } from '@/shared/ui/rate-value';
import { compareInstitutionsQuery, compareProductsQuery } from '../model/queries';

const CAPTION: Record<string, string> = {
  cd: 'Certificates of deposit',
  savings: 'Savings accounts',
  treasury: 'Treasury bills and notes',
};

function columns(institutions: InstitutionIndex, now: Date | undefined): Column<Product>[] {
  const bank = (p: Product): string => institutions.get(p.institutionId)?.name ?? 'Unknown bank';
  return [
    {
      id: 'bank',
      header: 'Bank',
      cell: bank,
      compare: (a, b) => bank(a).localeCompare(bank(b), 'en-US'),
    },
    { id: 'product', header: 'Product', cell: (p) => p.name },
    {
      id: 'term',
      header: 'Term',
      cell: (p) => (p.termMonths === null ? 'No term' : `${String(p.termMonths)} mo`),
      compare: (a, b) => (a.termMonths ?? 0) - (b.termMonths ?? 0),
      align: 'end',
    },
    {
      id: 'apy',
      header: 'Top APY',
      // the product's provenance stands for its rate tiers
      cell: (p) => (
        <FactValue
          fact={{ value: headlineApy(p), provenance: p.provenance }}
          render={(rate) => <RateValue rate={rate} />}
          {...(now ? { now } : {})}
        />
      ),
      compare: (a, b) => compareRate(headlineApy(a), headlineApy(b)),
      align: 'end',
    },
    {
      id: 'minOpening',
      header: 'Minimum to open',
      cell: (p) => formatUsd(p.minOpening),
      compare: (a, b) => a.minOpening - b.minOpening,
      align: 'end',
    },
  ];
}

function statusOf(
  q: { isError: boolean; isPending: boolean },
  count: number,
): 'error' | 'loading' | 'empty' | 'ready' {
  if (q.isError) return 'error';
  if (q.isPending) return 'loading';
  return count === 0 ? 'empty' : 'ready';
}

export function CompareTable({ category }: { category: ProductCategory }) {
  const products = useQuery(compareProductsQuery(category));
  const institutions = useQuery(compareInstitutionsQuery());
  const now = useFreshnessNow();
  const [filters] = useProductFilters();

  const index: InstitutionIndex = useMemo(
    () => new Map((institutions.data?.items ?? []).map((i) => [i.id, i])),
    [institutions.data],
  );
  const rows = useMemo(
    () => filterProducts(products.data?.items ?? [], filters, index),
    [products.data, filters, index],
  );
  const status = statusOf(products, rows.length);

  return (
    <DataTable
      caption={CAPTION[category] ?? 'Products'}
      columns={columns(index, now)}
      rows={rows}
      getRowId={(p) => p.id}
      defaultSort={{ columnId: 'apy', direction: 'desc' }}
      status={status}
      error={products.error}
      onRetry={() => void products.refetch()}
      emptyTitle="No products match these filters"
    />
  );
}
