'use client';

// Minimal compare table for ADR-016 D1: the data comes as props, loaded at build time, so the
// table is in the static HTML and the client never loads the gateway. Filters are read from the
// URL and run in memory. The filter form, ranking by profile and row summaries arrive in E5.
import { compareRate, formatUsd, type Product, type ProductCategory } from '@fa/contracts';
import { Suspense, useMemo } from 'react';
import { FactValue, freshnessNow } from '@/entities/fact';
import { headlineApy } from '@/entities/product';
import {
  filterProducts,
  useProductFilters,
  type InstitutionIndex,
} from '@/features/filter-products';
import { DataTable, type Column } from '@/shared/ui/data-table';
import { RateValue } from '@/shared/ui/rate-value';
import type { CompareData } from '../api/prefetch';

const CAPTION: Record<string, string> = {
  cd: 'Certificates of deposit',
  savings: 'Savings accounts',
  treasury: 'Treasury bills and notes',
};

type Filters = Parameters<typeof filterProducts>[1];
const NO_FILTERS: Filters = { term: [], kind: [], minApy: null, maxOpening: null, search: '' };

function columns(institutions: InstitutionIndex, now: Date): Column<Product>[] {
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
          now={now}
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

type Props = CompareData & { category: ProductCategory };

/**
 * Reading the URL suspends during prerendering, so the fallback is the same table without URL
 * filters: the static HTML holds the whole catalog, and URL filters apply after hydration.
 */
export function CompareTable(props: Props) {
  return (
    <Suspense fallback={<Table {...props} filters={NO_FILTERS} />}>
      <UrlFilteredTable {...props} />
    </Suspense>
  );
}

function UrlFilteredTable(props: Props) {
  const [filters] = useProductFilters();
  return <Table {...props} filters={filters} />;
}

function Table({
  category,
  products,
  institutions,
  dataset,
  filters,
}: Props & { filters: Filters }) {
  const index: InstitutionIndex = useMemo(
    () => new Map(institutions.map((i) => [i.id, i])),
    [institutions],
  );
  const rows = useMemo(() => filterProducts(products, filters, index), [products, filters, index]);
  return (
    <DataTable
      caption={CAPTION[category] ?? 'Products'}
      columns={columns(index, freshnessNow(dataset))}
      rows={rows}
      getRowId={(p) => p.id}
      defaultSort={{ columnId: 'apy', direction: 'desc' }}
      status={rows.length === 0 ? 'empty' : 'ready'}
      emptyTitle="No products match these filters"
    />
  );
}
