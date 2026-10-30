'use client';

// The compare table. Data comes as props, loaded at build time (ADR-016 D1), so the table is in the
// static HTML and the client never loads the gateway. Filters and the column sort are read from
// the URL and run in memory. With a complete profile the rows are ranked after tax in the browser
// (ADR-008); the profile never leaves it (ADR-004). The filter form and row summaries come next.
import type { ProductCategory } from '@fa/contracts';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  PROFILE_FORM_FIELDS,
  useCompleteProfile,
  useProfileDrawer,
  useProfileHydrated,
} from '@/entities/profile';
import { useNetYield } from '@/features/compute-net-yield';
import {
  effectiveSort,
  filterProducts,
  filterRanked,
  FilterForm,
  FilterFormStatic,
  useProductFilters,
  useProductSort,
  type ProductSort,
} from '@/features/filter-products';
import { DataTable, type Column } from '@/shared/ui/data-table';
import { freshnessNow } from '@/entities/fact';
import type { CompareData } from '../api/prefetch';
import { needsData } from '../model/needs-data';
import { defaultOrder, type Row } from '../model/order';
import { columns, shownSortKeys } from './columns';
import { NeedsDataNote } from './needs-data-note';
import { RowDetails, type InstitutionDetails } from './row-details';

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
  /** opens the profile drawer; null before hydration (the button shows disabled) */
  onOpenProfile: (() => void) | null;
  /** the filter form reads the URL; the prerendered fallback shows it disabled */
  withForm: boolean;
}

interface Url {
  filters: Filters;
  sort: ProductSort | null;
  setSort: (sort: ProductSort | null) => void;
  openProfile: () => void;
}
const noop = () => undefined;

/** Drops the pre-hydration cover once the row order will not change again (ADR-017). */
function ReleaseCatalog({ hold }: { hold: boolean }) {
  useLayoutEffect(() => {
    if (hold) return;
    document.documentElement.removeAttribute('data-has-profile');
  }, [hold]);
  return null;
}

function Catalog(props: {
  caption: string;
  columns: Column<Row>[];
  rows: readonly Row[];
  index: InstitutionDetails;
  taxYear: number;
  sort: ProductSort | null;
  sortDisabled: boolean;
  onSortChange: (next: ProductSort | null) => void;
  hold: boolean;
}) {
  return (
    <>
      <ReleaseCatalog hold={props.hold} />
      <div data-catalog-slot>
        <p
          data-catalog-pending
          className="rounded-lg border border-divider bg-surface px-3 py-4 text-sm text-muted"
        >
          Ranking for your profile…
        </p>
        <div data-catalog>
          <DataTable
            caption={props.caption}
            columns={props.columns}
            rows={props.rows}
            getRowId={(r) => r.product.id}
            renderExpanded={(r) => (
              <RowDetails row={r} institutions={props.index} taxYear={props.taxYear} />
            )}
            expandLabel={(r) =>
              `Show details: ${props.index.get(r.product.institutionId)?.name ?? 'Unknown bank'}, ${r.product.name}`
            }
            sort={props.sort}
            sortDisabled={props.sortDisabled}
            onSortChange={(next) => {
              if (next === null) {
                props.onSortChange(null);
                return;
              }
              props.onSortChange(next as ProductSort);
            }}
            status={props.rows.length === 0 ? 'empty' : 'ready'}
            emptyTitle="No products match these filters. Remove some, or use Reset filters."
          />
        </div>
      </div>
    </>
  );
}

/**
 * Reading the URL suspends during prerendering. Only the reader (UrlSync, renders nothing) sits
 * inside <Suspense>; the table stays outside, so the client hydrates the prerendered table instead
 * of throwing it away and building 60 rows again (Lighthouse TBT, E5 step 2). Until UrlSync reports
 * after hydration, the table shows the static state: the whole catalog by top APY.
 */
export function CompareTable(props: Props) {
  const [url, setUrl] = useState<Url | null>(null);
  return (
    <>
      <Suspense fallback={null}>
        <UrlSync onChange={setUrl} />
      </Suspense>
      <Table
        {...props}
        filters={url?.filters ?? NO_FILTERS}
        sort={url?.sort ?? null}
        onSortChange={url?.setSort ?? noop}
        onOpenProfile={url?.openProfile ?? null}
        withForm={url !== null}
      />
    </>
  );
}

function UrlSync({ onChange }: { onChange: (url: Url) => void }) {
  const [filters] = useProductFilters();
  const [sort, setSort] = useProductSort();
  // `open` is a new function on every render (it closes over the current field): reported through
  // a ref, or the effect below would re-run on every render and loop through setUrl
  const { open } = useProfileDrawer();
  const openRef = useRef(open);
  useLayoutEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    onChange({
      filters,
      sort,
      setSort: (next) => {
        void setSort(next);
      },
      openProfile: () => {
        openRef.current(PROFILE_FORM_FIELDS[0]);
      },
    });
  }, [filters, sort, setSort, onChange]);
  return null;
}

function Table(props: Props & UrlState) {
  const { category, products, institutions, dataset, taxTables, filters } = props;
  const index: InstitutionDetails = useMemo(
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
  const needs = needsData(ranked);
  const onOpenProfile = props.onOpenProfile;
  const holdCatalog = !useProfileHydrated() || (profile !== null && ranked === null);
  return (
    // filters beside the results from lg; stacked above them below it. minmax(0,1fr): the table
    // column may shrink below the table's width, so the table scrolls instead of the page
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
      {props.withForm ? (
        <FilterForm terms={terms} withProfile={withProfile} />
      ) : (
        <FilterFormStatic terms={terms} />
      )}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          {/* one live region: a filter change announces the new count */}
          <div aria-live="polite" className="min-w-0">
            <h2 className="text-xl font-semibold tabular-nums">
              {rows.length === 1 ? '1 product' : `${String(rows.length)} products`}
            </h2>
            <p className="text-sm text-muted">
              {sort === null ? defaultOrderNote(withProfile) : 'Sorted by the chosen column.'}
            </p>
          </div>
          <button
            type="button"
            disabled={onOpenProfile === null}
            onClick={() => {
              onOpenProfile?.();
            }}
            className={`btn ${withProfile ? '' : 'btn-primary'}`}
          >
            {withProfile ? 'Edit profile' : 'Add your profile'}
          </button>
        </div>
        {props.withForm && needs !== null ? <NeedsDataNote needs={needs} /> : null}
        <Catalog
          caption={CAPTION[category] ?? 'Products'}
          columns={columns(index, freshnessNow(dataset), withProfile)}
          rows={rows}
          index={index}
          taxYear={taxTables.taxYear}
          sort={sort}
          sortDisabled={!props.withForm}
          onSortChange={props.onSortChange}
          hold={holdCatalog}
        />
      </div>
    </div>
  );
}
