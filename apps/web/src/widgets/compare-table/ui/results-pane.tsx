'use client';

import type { Cents, ProductCategory } from '@fa/contracts';
import { useLayoutEffect, useState } from 'react';
import type { ProfileFormField } from '@/entities/profile';
import { ScenarioBar } from '@/features/edit-profile';
import { FilterChips, type ProductFilters, type ProductSort } from '@/features/filter-products';
import type { OpenCitation } from '@/features/open-citation';
import { DataTable, type Column } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/states';
import type { NeedsData } from '../model/needs-data';
import type { Row } from '../model/order';
import { CONTENT_VISIBILITY_AFTER } from '../model/visibility';
import { NeedsDataNote } from './needs-data-note';
import { ResultCards } from './result-cards';
import { RowDetails, type InstitutionDetails } from './row-details';
import { TopPicks } from './top-picks';

const EMPTY_FILTERS = 'No products match these filters. Remove some, or use Reset filters.';

const SORT_OPTIONS: {
  id: ProductSort['columnId'];
  label: string;
  direction: 'asc' | 'desc';
  needsProfile: boolean;
}[] = [
  { id: 'netInterest', label: 'Net interest', direction: 'desc', needsProfile: true },
  { id: 'netYield', label: 'Net yield', direction: 'desc', needsProfile: true },
  { id: 'apy', label: 'Top APY', direction: 'desc', needsProfile: false },
  { id: 'term', label: 'Term', direction: 'asc', needsProfile: false },
  { id: 'minOpening', label: 'Minimum to open', direction: 'asc', needsProfile: false },
  { id: 'bank', label: 'Bank', direction: 'asc', needsProfile: false },
];

export interface ResultsPaneProps {
  category: ProductCategory;
  caption: string;
  taxYear: number;
  filters: ProductFilters;
  withForm: boolean;
  withProfile: boolean;
  visibleCount: number;
  sort: ProductSort | null;
  ordered: readonly Row[];
  hiddenRowIds: ReadonlySet<string>;
  netScale: Cents | null;
  institutions: InstitutionDetails;
  needs: NeedsData | null;
  holdCatalog: boolean;
  tableSort: ProductSort | null;
  emphasizeNet: boolean;
  columns: Column<Row>[];
  nowFor: (product: Row['product']) => Date;
  onSortChange: (sort: ProductSort | null) => void;
  onFiltersChange: (patch: Partial<ProductFilters> | null) => void;
  onOpenProfile: ((field: ProfileFormField) => void) | null;
  onOpenCitation: ((ref: OpenCitation) => void) | null;
}

const orderNote = (withProfile: boolean): string =>
  withProfile
    ? 'Ranked for your profile: eligible first, then by net interest after tax.'
    : 'Sorted by top APY. Add your profile for after-tax ranking.';

export function ResultsPane(props: ResultsPaneProps) {
  const [density, setDensity] = useState<'table' | 'cards'>('table');
  const onOpenProfile = props.onOpenProfile;
  return (
    <div data-results className="flex min-w-0 flex-col gap-4">
      <ScenarioBar
        taxYear={props.taxYear}
        editDisabled={onOpenProfile === null}
        onEdit={(field) => {
          onOpenProfile?.(field);
        }}
      />
      <TopPicks
        rows={props.ordered}
        hidden={props.hiddenRowIds}
        institutions={props.institutions}
        withProfile={props.withProfile}
      />
      <FilterChips
        filters={props.filters}
        disabled={!props.withForm}
        onChange={props.onFiltersChange}
      />
      <ResultsHeader {...props} density={density} onDensity={setDensity} />
      {props.withForm && props.needs !== null ? <NeedsDataNote needs={props.needs} /> : null}
      <ReleaseCatalog hold={props.holdCatalog} />
      <CatalogBody {...props} density={density} />
    </div>
  );
}

function ResultsHeader(
  props: ResultsPaneProps & {
    density: 'table' | 'cards';
    onDensity: (mode: 'table' | 'cards') => void;
  },
) {
  const count = props.visibleCount === 1 ? '1 product' : `${String(props.visibleCount)} products`;
  const note = props.sort === null ? orderNote(props.withProfile) : 'Sorted by the chosen column.';
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div aria-live="polite" className="min-w-0">
        <h2 className="text-xl font-semibold tabular-nums">{count}</h2>
        <p className="text-sm text-muted">{note}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SortSelect
          sort={props.sort}
          withForm={props.withForm}
          withProfile={props.withProfile}
          onSortChange={props.onSortChange}
        />
        <DensityToggle density={props.density} onDensity={props.onDensity} />
      </div>
    </div>
  );
}

function SortSelect(props: {
  sort: ProductSort | null;
  withForm: boolean;
  withProfile: boolean;
  onSortChange: (sort: ProductSort | null) => void;
}) {
  return (
    <label className="text-sm">
      <span className="sr-only">Sort</span>
      <select
        className="control h-8 w-auto"
        disabled={!props.withForm}
        value={props.sort === null ? '' : props.sort.columnId}
        onChange={(event) => {
          chooseSort(event.target.value, props.onSortChange);
        }}
      >
        <option value="">Default ranking</option>
        {SORT_OPTIONS.map((option) => (
          <option
            key={option.id}
            value={option.id}
            disabled={option.needsProfile ? !props.withProfile : false}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function chooseSort(id: string, onSortChange: (sort: ProductSort | null) => void): void {
  if (id === '') {
    onSortChange(null);
    return;
  }
  const option = SORT_OPTIONS.find((item) => item.id === id);
  if (option === undefined) return;
  onSortChange({ columnId: option.id, direction: option.direction });
}

function DensityToggle(props: {
  density: 'table' | 'cards';
  onDensity: (mode: 'table' | 'cards') => void;
}) {
  return (
    <div
      role="group"
      aria-label="Density"
      className="hidden rounded-md border border-border p-0.5 lg:inline-flex"
    >
      {(['table', 'cards'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={props.density === mode}
          onClick={() => {
            props.onDensity(mode);
          }}
          className={`h-7 rounded-md px-2 text-sm capitalize ${props.density === mode ? 'bg-primary text-primary-foreground' : ''}`}
        >
          {mode === 'table' ? 'Table' : 'Cards'}
        </button>
      ))}
    </div>
  );
}

function CatalogBody(props: ResultsPaneProps & { density: 'table' | 'cards' }) {
  const tableClass = props.density === 'cards' ? 'hidden' : 'hidden lg:block';
  const cardsClass = props.density === 'cards' ? 'block' : 'lg:hidden';
  return (
    <div data-catalog-slot>
      <p
        data-catalog-pending
        className="rounded-lg border border-divider bg-surface px-3 py-4 text-sm text-muted"
      >
        Ranking for your profile…
      </p>
      <div data-catalog className="flex flex-col gap-4">
        <div className={tableClass}>
          <ProductTable {...props} />
        </div>
        <div className={cardsClass}>
          <ResultCards
            caption={props.caption}
            rows={props.ordered}
            hidden={props.hiddenRowIds}
            institutions={props.institutions}
            withProfile={props.withProfile}
            netScale={props.netScale}
            taxYear={props.taxYear}
            nowFor={props.nowFor}
            onOpen={props.onOpenCitation}
            onOpenProfile={props.onOpenProfile}
          />
        </div>
        {props.visibleCount === 0 ? (
          <EmptyState title={EMPTY_FILTERS}>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!props.withForm}
              onClick={() => {
                props.onFiltersChange(null);
              }}
            >
              Reset filters
            </button>
          </EmptyState>
        ) : null}
      </div>
    </div>
  );
}

function ProductTable(props: ResultsPaneProps) {
  const emphasis = props.emphasizeNet ? { emphasisColumnId: 'netInterest' as const } : {};
  return (
    <DataTable
      caption={props.caption}
      columns={props.columns}
      rows={props.ordered}
      hiddenRowIds={props.hiddenRowIds}
      contentVisibilityAfter={CONTENT_VISIBILITY_AFTER}
      getRowId={(row) => row.product.id}
      renderExpanded={(row) => (
        <RowDetails
          row={row}
          institutions={props.institutions}
          taxYear={props.taxYear}
          onOpen={props.onOpenCitation}
        />
      )}
      expandLabel={(row) => expandName(row, props.institutions)}
      expandOnRowClick
      stickyHeader
      {...emphasis}
      sort={props.tableSort}
      sortDisabled={!props.withForm}
      onSortChange={(next) => {
        commitSort(next, props.onSortChange);
      }}
      rowClassName={rowDim}
    />
  );
}

function expandName(row: Row, institutions: InstitutionDetails): string {
  const bank = institutions.get(row.product.institutionId)?.name ?? 'Unknown bank';
  return `${bank}, ${row.product.name}`;
}

function rowDim(row: Row): string | undefined {
  if (row.ranked?.group !== 'ineligible') return undefined;
  return 'opacity-60';
}

function commitSort(
  next: { columnId: string; direction: 'asc' | 'desc' } | null,
  onSortChange: (sort: ProductSort | null) => void,
): void {
  if (next === null) {
    onSortChange(null);
    return;
  }
  onSortChange(next as ProductSort);
}

function ReleaseCatalog({ hold }: { hold: boolean }) {
  useLayoutEffect(() => {
    if (hold) return;
    document.documentElement.removeAttribute('data-has-profile');
  }, [hold]);
  return null;
}
