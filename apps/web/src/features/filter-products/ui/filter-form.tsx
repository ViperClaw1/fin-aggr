'use client';

import type { ProductCategory } from '@fa/contracts';
import { useEffect, useId, useRef, useState } from 'react';
import { useProductFilters, type ProductFilters } from '../model/search-params';
import { FilterBar, FilterSheet, type FilterStats } from './filter-fields';

export type { FilterStats } from './filter-fields';

interface FilterFormProps {
  category: ProductCategory;
  stats: FilterStats;
  withProfile: boolean;
  visibleCount: number;
}

type SetFilters = (patch: Partial<ProductFilters> | null) => unknown;

const EMPTY: ProductFilters = {
  term: [],
  kind: [],
  minApy: null,
  maxOpening: null,
  search: '',
  hide: null,
};

export function FilterForm(props: FilterFormProps) {
  const [filters, setFilters] = useProductFilters();
  return <FilterFormView {...props} filters={filters} setFilters={setFilters} disabled={false} />;
}

/** The form before hydration: the same fields, disabled, without reading the URL. */
export function FilterFormStatic({ category, stats }: Pick<FilterFormProps, 'category' | 'stats'>) {
  return (
    <FilterFormView
      category={category}
      stats={stats}
      withProfile={false}
      visibleCount={stats.apyPercents.length}
      filters={EMPTY}
      setFilters={() => undefined}
      disabled
    />
  );
}

interface ViewProps extends FilterFormProps {
  filters: ProductFilters;
  setFilters: SetFilters;
  disabled: boolean;
}

export const activeFilterCount = (filters: ProductFilters): number =>
  (filters.term.length > 0 ? 1 : 0) +
  filters.kind.length +
  [filters.minApy, filters.maxOpening, filters.hide].filter((value) => value !== null).length +
  (filters.search === '' ? 0 : 1);

export function FilterFormView({
  category,
  stats,
  withProfile,
  visibleCount,
  filters,
  setFilters,
  disabled,
}: ViewProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const openButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLFieldSetElement>(null);
  const count = activeFilterCount(filters);
  const showLabel = visibleCount === 1 ? 'Show 1 product' : `Show ${String(visibleCount)} products`;

  useEffect(() => {
    if (!open) return undefined;
    const button = openButton.current;
    panel.current?.querySelector('input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      button?.focus();
    };
  }, [open]);

  const reset = () => {
    void setFilters(null);
  };

  return (
    <form
      aria-label="Filters"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard-focusable (WCAG 2.1.1, axe scrollable-region-focusable), spec §6 rule 6
      tabIndex={0}
      className="lg:sticky lg:top-16 lg:flex lg:max-h-[calc(100dvh-5rem)] lg:w-64 lg:flex-col lg:overflow-y-auto lg:overscroll-contain lg:rounded-lg lg:border lg:border-divider lg:bg-surface lg:p-4"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <FilterBar
        count={count}
        open={open}
        panelId={id}
        disabled={disabled}
        openButton={openButton}
        onOpen={() => {
          setOpen(true);
        }}
        onClose={() => {
          setOpen(false);
        }}
        onReset={reset}
      />
      <FilterSheet
        open={open}
        panel={panel}
        id={id}
        disabled={disabled}
        showLabel={showLabel}
        category={category}
        stats={stats}
        filters={filters}
        setFilters={setFilters}
        withProfile={withProfile}
        onClose={() => {
          setOpen(false);
        }}
      />
    </form>
  );
}
