'use client';

import { INSTITUTION_KINDS, type ProductCategory } from '@fa/contracts';
import type { RefObject } from 'react';
import { INSTITUTION_KIND_LABEL } from '@/entities/institution';
import { termFilterForWindow } from '../model/term-window';
import type { ProductFilters } from '../model/search-params';
import { ApyFilter } from './apy-filter';
import { OpeningFilter } from './opening-filter';
import { TermRangeFilter } from './term-range-filter';

export interface TermCount {
  months: number;
  count: number;
}

export interface FilterStats {
  terms: readonly number[];
  termCounts: readonly TermCount[];
  /** Headline APY percents for the histogram. Geometry only. */
  apyPercents: readonly number[];
  kindCounts: Readonly<Record<(typeof INSTITUTION_KINDS)[number], number>>;
}

type SetFilters = (patch: Partial<ProductFilters> | null) => unknown;

const toggle = <T,>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

const SHEET_OPEN =
  'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-5 overflow-y-auto rounded-t-lg border border-divider bg-background p-4 lg:static lg:z-auto lg:mt-4 lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0';
const SHEET_CLOSED = 'mt-4 hidden min-w-0 flex-col gap-5 lg:flex';

export function FilterBar(props: {
  count: number;
  open: boolean;
  panelId: string;
  disabled: boolean;
  openButton: RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
  onClose: () => void;
  onReset: () => void;
}) {
  return (
    <>
      <div className="hidden items-center justify-between gap-3 lg:flex">
        <h2 className="text-base font-semibold">
          Filters
          {props.count === 0 ? null : (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-primary px-1 text-xs text-primary-foreground tabular-nums">
              {props.count}
              <span className="sr-only"> active</span>
            </span>
          )}
        </h2>
        <ResetButton disabled={props.disabled} onReset={props.onReset} />
      </div>
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <button
          ref={props.openButton}
          type="button"
          aria-expanded={props.open}
          aria-controls={props.panelId}
          disabled={props.disabled}
          onClick={props.onOpen}
          className="btn btn-sm"
        >
          Filters ({props.count})
        </button>
        <ResetButton disabled={props.disabled} onReset={props.onReset} />
      </div>
      {props.open ? (
        <button
          type="button"
          aria-label="Close filters"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={props.onClose}
        />
      ) : null}
    </>
  );
}

function ResetButton(props: { disabled: boolean; onReset: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-label="Reset filters"
      className="text-sm font-medium text-accent underline underline-offset-2 disabled:opacity-60"
      onClick={props.onReset}
    >
      Reset
    </button>
  );
}

export function FilterSheet(props: {
  open: boolean;
  panel: RefObject<HTMLFieldSetElement | null>;
  id: string;
  disabled: boolean;
  showLabel: string;
  category: ProductCategory;
  stats: FilterStats;
  filters: ProductFilters;
  setFilters: SetFilters;
  withProfile: boolean;
  onClose: () => void;
}) {
  return (
    <fieldset
      ref={props.panel}
      id={props.id}
      disabled={props.disabled}
      aria-busy={props.disabled}
      className={props.open ? SHEET_OPEN : SHEET_CLOSED}
    >
      <div className="flex items-center justify-between lg:hidden">
        <h2 className="text-base font-semibold">Filters</h2>
        <button type="button" className="btn btn-sm" onClick={props.onClose}>
          Close
        </button>
      </div>
      <SearchField
        id={`${props.id}-search`}
        value={props.filters.search}
        onChange={(search) => void props.setFilters({ search })}
      />
      <FilterControls
        category={props.category}
        stats={props.stats}
        filters={props.filters}
        setFilters={props.setFilters}
        withProfile={props.withProfile}
      />
      <button
        type="button"
        className="btn btn-primary sticky bottom-0 lg:hidden"
        onClick={props.onClose}
      >
        {props.showLabel}
      </button>
    </fieldset>
  );
}

function SearchField(props: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.id} className="text-sm font-medium">
        Search bank or product
      </label>
      <input
        id={props.id}
        type="search"
        placeholder="Bank or product, e.g. Ironwood"
        value={props.value}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        className="control px-2 text-sm placeholder:text-[11px]"
      />
    </div>
  );
}

function FilterControls(props: {
  category: ProductCategory;
  stats: FilterStats;
  filters: ProductFilters;
  setFilters: SetFilters;
  withProfile: boolean;
}) {
  const { category, stats, filters, setFilters, withProfile } = props;
  return (
    <>
      {stats.terms.length === 0 ? null : (
        <TermRangeFilter
          category={category}
          catalog={stats.terms}
          counts={stats.termCounts}
          selected={filters.term}
          onWindow={(minDay, maxDay) => {
            void setFilters({ term: termFilterForWindow(stats.terms, minDay, maxDay) });
          }}
        />
      )}
      <ApyFilter
        percents={stats.apyPercents}
        value={filters.minApy}
        onChange={(minApy) => void setFilters({ minApy })}
      />
      <OpeningFilter
        value={filters.maxOpening}
        onChange={(maxOpening) => void setFilters({ maxOpening })}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Institution type</legend>
        {INSTITUTION_KINDS.map((kind) => (
          <label key={kind} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.kind.includes(kind)}
              onChange={() => void setFilters({ kind: toggle(filters.kind, kind) })}
              className="size-4"
            />
            {INSTITUTION_KIND_LABEL[kind]} ({stats.kindCounts[kind]})
          </label>
        ))}
      </fieldset>
      <HideIneligible
        withProfile={withProfile}
        checked={filters.hide === 'ineligible'}
        onChange={(hide) => void setFilters({ hide: hide ? 'ineligible' : null })}
      />
    </>
  );
}

function HideIneligible(props: {
  withProfile: boolean;
  checked: boolean;
  onChange: (hide: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={props.withProfile ? props.checked : false}
        disabled={!props.withProfile}
        onClick={() => {
          props.onChange(!props.checked);
        }}
        className="inline-flex items-center gap-2 text-left text-sm disabled:opacity-60"
      >
        <span
          className={`relative h-5 w-9 shrink-0 rounded-full border border-border ${props.checked && props.withProfile ? 'bg-primary' : 'bg-background'}`}
          aria-hidden="true"
        >
          <span
            className={`absolute top-0.5 size-3.5 rounded-full bg-foreground ${props.checked && props.withProfile ? 'right-0.5' : 'left-0.5'}`}
          />
        </span>
        Hide products I can&apos;t open
      </button>
      {props.withProfile ? null : <p className="text-xs text-muted">Add your profile first</p>}
    </div>
  );
}
