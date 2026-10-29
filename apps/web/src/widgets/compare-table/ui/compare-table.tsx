'use client';

// The compare table. Data comes as props, loaded at build time (ADR-016 D1), so the table is in the
// static HTML and the client never loads the gateway. Filters and the column sort are read from
// the URL and run in memory. With a complete profile the rows are ranked after tax in the browser
// (ADR-008); the profile never leaves it (ADR-004). The filter form and row summaries come next.
import type { ProductCategory } from '@fa/contracts';
import { Suspense, useMemo } from 'react';
import { useCompleteProfile } from '@/entities/profile';
import { useNetYield } from '@/features/compute-net-yield';
import {
  effectiveSort,
  filterProducts,
  filterRanked,
  FilterForm,
  useProductFilters,
  useProductSort,
  type InstitutionIndex,
  type ProductSort,
} from '@/features/filter-products';
import { DataTable } from '@/shared/ui/data-table';
import { freshnessNow } from '@/entities/fact';
import type { CompareData } from '../api/prefetch';
import { defaultOrder } from '../model/order';
import { columns, shownSortKeys } from './columns';

const CAPTION: Record<string, string> = {
  cd: 'Certificates of deposit',
  savings: 'Savings accounts',
  treasury: 'Treasury bills and notes',
};

type Filters = Parameters<typeof filterProducts>[1] & { hide: 'ineligible' | null };
const NO_FILTERS: Filters = {
  term: [],
  kind: [],
  minApy: null,
  maxOpening: null,
  search: '',
  hide: null,
};

type Props = CompareData & { category: ProductCategory };

/** Says which rule orders the rows when no column is sorted (ADR-008). */
const defaultOrderNote = (withProfile: boolean): string =>
  withProfile
    ? 'Ranked for your profile: eligible first, then by net interest after tax.'
    : 'Sorted by top APY. Add your profile for after-tax ranking.';
interface UrlState {
  filters: Filters;
  sort: ProductSort | null;
  onSortChange: (sort: ProductSort | null) => void;
  /** the filter form reads the URL, so the prerendered fallback has none */
  withForm: boolean;
}

/**
 * Reading the URL suspends during prerendering, so the fallback is the same table without URL
 * state: the static HTML holds the whole catalog by top APY; URL state applies after hydration.
 */
export function CompareTable(props: Props) {
  const noop = () => undefined;
  return (
    <Suspense
      fallback={
        <Table {...props} filters={NO_FILTERS} sort={null} onSortChange={noop} withForm={false} />
      }
    >
      <UrlTable {...props} />
    </Suspense>
  );
}

function UrlTable(props: Props) {
  const [filters] = useProductFilters();
  const [sort, setSort] = useProductSort();
  return (
    <Table
      {...props}
      withForm
      filters={filters}
      sort={sort}
      onSortChange={(next) => {
        void setSort(next);
      }}
    />
  );
}

function Table(props: Props & UrlState) {
  const { category, products, institutions, dataset, taxTables, filters } = props;
  const index: InstitutionIndex = useMemo(
    () => new Map(institutions.map((i) => [i.id, i])),
    [institutions],
  );
  const filtered = useMemo(
    () => filterProducts(products, filters, index),
    [products, filters, index],
  );
  const profile = useCompleteProfile(taxTables.taxYear);
  const ranked = useNetYield(filtered, profile, taxTables);
  const rows = useMemo(
    () => defaultOrder(filtered, ranked === null ? null : filterRanked(ranked, filters.hide)),
    [filtered, ranked, filters.hide],
  );
  const withProfile = ranked !== null;
  const terms = useMemo(
    () =>
      [...new Set(products.flatMap((p) => (p.termMonths === null ? [] : [p.termMonths])))].sort(
        (a, b) => a - b,
      ),
    [products],
  );
  const sort = effectiveSort(props.sort, shownSortKeys(withProfile));
  return (
    <div className="flex flex-col gap-2">
      {props.withForm ? <FilterForm terms={terms} withProfile={withProfile} /> : null}
      <p className="text-sm text-muted" aria-live="polite">
        {sort === null ? defaultOrderNote(withProfile) : null}
      </p>
      <DataTable
        caption={CAPTION[category] ?? 'Products'}
        columns={columns(index, freshnessNow(dataset), withProfile)}
        rows={rows}
        getRowId={(r) => r.product.id}
        sort={sort}
        onSortChange={(next) => {
          props.onSortChange(next === null ? null : (next as ProductSort));
        }}
        status={rows.length === 0 ? 'empty' : 'ready'}
        emptyTitle="No products match these filters"
      />
    </div>
  );
}
