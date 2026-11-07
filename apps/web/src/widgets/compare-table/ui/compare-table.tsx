'use client';

// The compare table. Data comes as props, loaded at build time (ADR-016 D1), so the table is in the
// static HTML and the client never loads the gateway. Filters and the column sort are read from
// the URL. A filter hides rows; it does not drop them, so the body stays mounted (step 2.9).
// With a complete profile the rows are ranked after tax in the browser
// (ADR-008); the profile never leaves it (ADR-004).
import type { ProductCategory } from '@fa/contracts';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { freshnessNow } from '@/entities/fact';
import { headlineApy } from '@/entities/product';
import {
  PROFILE_FORM_FIELDS,
  useCompleteProfile,
  useProfileDrawer,
  useProfileHydrated,
  type ProfileFormField,
} from '@/entities/profile';
import { useNetYield } from '@/features/compute-net-yield';
import { useOpenCitation, type OpenCitation } from '@/features/open-citation';
import {
  effectiveSort,
  FilterForm,
  FilterFormStatic,
  filterProducts,
  useProductFilters,
  useProductSort,
  type FilterStats,
  type ProductFilters,
  type ProductSort,
} from '@/features/filter-products';
import type { CompareData } from '../api/prefetch';
import { needsData } from '../model/needs-data';
import { defaultOrder, type Row } from '../model/order';
import { hiddenProductIds } from '../model/visibility';
import { unpackCompareProducts, type CompareProduct } from '../model/wire';
import { columns, maxNetInterest, shownSortKeys, sortByNetInterest } from './columns';
import { ResultsPane } from './results-pane';
import type { InstitutionDetails } from './row-details';

const CAPTION: Record<string, string> = {
  cd: 'Certificates of deposit',
  savings: 'Savings accounts',
  treasury: 'Treasury bills and notes',
};

type Filters = ProductFilters;
const NO_FILTERS: Filters = {
  term: [],
  kind: [],
  minApy: null,
  maxOpening: null,
  search: '',
  hide: null,
};

type Props = CompareData & { category: ProductCategory };

interface UrlState {
  filters: Filters;
  sort: ProductSort | null;
  onSortChange: (sort: ProductSort | null) => void;
  onFiltersChange: (patch: Partial<Filters> | null) => void;
  onOpenProfile: ((field: ProfileFormField) => void) | null;
  onOpenCitation: ((ref: OpenCitation) => void) | null;
  withForm: boolean;
}

interface Url {
  filters: Filters;
  sort: ProductSort | null;
  setSort: (sort: ProductSort | null) => void;
  setFilters: (patch: Partial<Filters> | null) => void;
  openProfile: (field?: ProfileFormField) => void;
  openCitation: (ref: OpenCitation) => void;
}
const noop = () => undefined;

function catalogStats(products: readonly CompareProduct[], index: InstitutionDetails): FilterStats {
  const termCounts = new Map<number, number>();
  const apyPercents: number[] = [];
  const kindCounts = {
    direct_bank: 0,
    credit_union: 0,
    fintech_partner: 0,
  };
  for (const product of products) {
    if (product.termMonths !== null) {
      termCounts.set(product.termMonths, (termCounts.get(product.termMonths) ?? 0) + 1);
    }
    // Histogram geometry only. The rate shown in the table stays a string.
    apyPercents.push(Number(headlineApy(product)) * 100);
    const kind = index.get(product.institutionId)?.kind;
    if (kind !== undefined) kindCounts[kind] += 1;
  }
  return {
    terms: [...termCounts.keys()].sort((a, b) => a - b),
    termCounts: [...termCounts.entries()]
      .map(([months, count]) => ({ months, count }))
      .sort((a, b) => a.months - b.months),
    apyPercents,
    kindCounts,
  };
}

function useVisibleCatalog(
  products: readonly CompareProduct[],
  filters: Filters,
  index: InstitutionDetails,
  taxTables: Props['taxTables'],
) {
  const matched = useMemo(() => {
    const ids = new Set<string>();
    for (const product of filterProducts(products, filters, index)) ids.add(product.id);
    return ids;
  }, [products, filters, index]);
  const profile = useCompleteProfile(taxTables.taxYear);
  const ranked = useNetYield(products, profile, taxTables);
  const rows = useMemo(() => defaultOrder(products, ranked), [products, ranked]);
  const hiddenRowIds = useMemo(
    () =>
      hiddenProductIds(
        rows.map((row) => ({ id: row.product.id, group: row.ranked?.group ?? null })),
        matched,
        filters.hide,
      ),
    [rows, matched, filters.hide],
  );
  return {
    rows,
    hiddenRowIds,
    visibleCount: rows.length - hiddenRowIds.size,
    profile,
    ranked,
    needs: needsData(ranked === null ? null : ranked.filter((row) => matched.has(row.productId))),
  };
}

function urlState(url: Url | null): UrlState {
  if (url === null) {
    return {
      filters: NO_FILTERS,
      sort: null,
      onSortChange: noop,
      onFiltersChange: noop,
      onOpenProfile: null,
      onOpenCitation: null,
      withForm: false,
    };
  }
  return {
    filters: url.filters,
    sort: url.sort,
    onSortChange: url.setSort,
    onFiltersChange: url.setFilters,
    onOpenProfile: url.openProfile,
    onOpenCitation: url.openCitation,
    withForm: true,
  };
}

export function CompareTable(props: Props) {
  const [url, setUrl] = useState<Url | null>(null);
  return (
    <>
      <Suspense fallback={null}>
        <UrlSync onChange={setUrl} />
      </Suspense>
      <Table {...props} {...urlState(url)} />
    </>
  );
}

function UrlSync({ onChange }: { onChange: (url: Url) => void }) {
  const [filters, setFilters] = useProductFilters();
  const [sort, setSort] = useProductSort();
  const { open } = useProfileDrawer();
  const { open: openCitation } = useOpenCitation();
  const openRef = useRef(open);
  const citationRef = useRef(openCitation);
  useLayoutEffect(() => {
    openRef.current = open;
    citationRef.current = openCitation;
  });
  useEffect(() => {
    onChange({
      filters,
      sort,
      setSort: (next) => {
        void setSort(next);
      },
      setFilters: (patch) => {
        void setFilters(patch);
      },
      openProfile: (field) => {
        openRef.current(field ?? PROFILE_FORM_FIELDS[0]);
      },
      openCitation: (ref) => {
        citationRef.current(ref);
      },
    });
  }, [filters, sort, setSort, setFilters, onChange]);
  return null;
}

function listingSort(sort: ProductSort | null, rows: readonly Row[]) {
  if (sort?.columnId !== 'netYield') {
    return { ordered: rows, tableSort: sort, emphasizeNet: false };
  }
  return {
    ordered: sortByNetInterest(rows, sort.direction),
    tableSort: null,
    emphasizeNet: true,
  };
}

function holdCatalog(hydrated: boolean, profile: unknown, ranked: unknown): boolean {
  if (!hydrated) return true;
  return profile !== null && ranked === null;
}

function Table(props: Props & UrlState) {
  const { category, institutions, dataset, taxTables, filters } = props;
  const products = useMemo(() => unpackCompareProducts(props.products), [props.products]);
  const index: InstitutionDetails = useMemo(
    () => new Map(institutions.map((item) => [item.id, item])),
    [institutions],
  );
  const stats = useMemo(() => catalogStats(products, index), [products, index]);
  const catalog = useVisibleCatalog(products, filters, index, taxTables);
  const { rows, hiddenRowIds, visibleCount, profile, ranked } = catalog;
  const withProfile = ranked !== null;
  const sort = effectiveSort(props.sort, shownSortKeys(withProfile));
  const listing = listingSort(sort, rows);
  const netScale = useMemo(
    () => maxNetInterest(listing.ordered, hiddenRowIds),
    [listing.ordered, hiddenRowIds],
  );
  const hydrated = useProfileHydrated();
  const nowFor = (product: Pick<CompareProduct, 'category' | 'provenance'>) =>
    freshnessNow(dataset, undefined, {
      isMock: product.provenance.isMock,
      domain: product.category === 'treasury' ? 'treasury' : 'products',
    });
  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
      <FilterSide
        withForm={props.withForm}
        category={category}
        stats={stats}
        withProfile={withProfile}
        visibleCount={visibleCount}
      />
      <ResultsPane
        category={category}
        caption={CAPTION[category] ?? 'Products'}
        taxYear={taxTables.taxYear}
        filters={filters}
        withForm={props.withForm}
        withProfile={withProfile}
        visibleCount={visibleCount}
        sort={sort}
        ordered={listing.ordered}
        hiddenRowIds={hiddenRowIds}
        netScale={netScale}
        institutions={index}
        needs={catalog.needs}
        holdCatalog={holdCatalog(hydrated, profile, ranked)}
        tableSort={listing.tableSort}
        emphasizeNet={listing.emphasizeNet}
        columns={columns({
          institutions: index,
          nowFor,
          withProfile,
          onOpen: props.onOpenCitation,
          onOpenProfile: props.onOpenProfile,
          netScale,
        })}
        nowFor={nowFor}
        onSortChange={props.onSortChange}
        onFiltersChange={props.onFiltersChange}
        onOpenProfile={props.onOpenProfile}
        onOpenCitation={props.onOpenCitation}
      />
    </div>
  );
}

function FilterSide(props: {
  withForm: boolean;
  category: ProductCategory;
  stats: FilterStats;
  withProfile: boolean;
  visibleCount: number;
}) {
  if (!props.withForm) return <FilterFormStatic category={props.category} stats={props.stats} />;
  return (
    <FilterForm
      category={props.category}
      stats={props.stats}
      withProfile={props.withProfile}
      visibleCount={props.visibleCount}
    />
  );
}
