'use client';

// The filter form of the compare table. Every change goes to the URL at once (search is debounced
// by its parser); the table filters in memory. Never filled from the profile (ADR-004). Reset
// clears every filter key; the money and rate fields are uncontrolled, so they remount.
// The prerendered page shows the same form disabled (FilterFormStatic), so hydration does not move
// the table: the same fields give the same height at every width (no layout shift, CLS).
import { INSTITUTION_KINDS } from '@fa/contracts';
import { useId, useState } from 'react';
import { INSTITUTION_KIND_LABEL } from '@/entities/institution';
import { MoneyInput, PercentInput } from '@/shared/ui/inputs';
import { useProductFilters, type ProductFilters } from '../model/search-params';

interface FilterFormProps {
  /** the terms present in the catalog, ascending */
  terms: readonly number[];
  /** "hide ineligible" needs eligibility, which needs a profile */
  withProfile: boolean;
}

const toggle = <T,>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

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
export function FilterFormStatic({ terms }: Pick<FilterFormProps, 'terms'>) {
  return (
    <FilterFormView
      terms={terms}
      withProfile={false}
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

const activeCount = (f: ProductFilters): number =>
  f.term.length +
  f.kind.length +
  [f.minApy, f.maxOpening, f.hide].filter((v) => v !== null).length +
  (f.search === '' ? 0 : 1);

interface FilterHeaderProps {
  count: number;
  open: boolean;
  /** id of the collapsible fields */
  controls: string;
  disabled: boolean;
  onToggle: () => void;
  onReset: () => void;
}

/** Below `lg` the toggle with the active filter count; from `lg` a plain heading. */
function FilterHeader({ count, open, controls, disabled, onToggle, onReset }: FilterHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={controls}
        // the static form is replaced on hydration: a panel opened before it would close again
        disabled={disabled}
        onClick={onToggle}
        className="btn btn-sm lg:hidden"
      >
        Filters ({count})<span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      <h2 className="hidden text-base font-semibold lg:block">Filters</h2>
      <button
        type="button"
        disabled={disabled}
        className="text-sm font-medium text-accent underline underline-offset-2 disabled:opacity-60"
        onClick={onReset}
      >
        Reset filters
      </button>
    </div>
  );
}

/**
 * A sidebar from `lg`; below it a collapsed panel behind "Filters (n)", so on a phone the table
 * is not a screen away. Collapsed in the prerendered and the hydrated page alike (no CLS).
 */
function FilterFormView({ terms, withProfile, filters, setFilters, disabled }: ViewProps) {
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <form
      aria-label="Filters"
      className="panel flex flex-col p-3 lg:p-4"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <FilterHeader
        count={activeCount(filters)}
        open={open}
        controls={`${id}-fields`}
        disabled={disabled}
        onToggle={() => {
          setOpen((o) => !o);
        }}
        onReset={() => {
          void setFilters(null);
          setRevision((r) => r + 1);
        }}
      />
      <fieldset
        id={`${id}-fields`}
        disabled={disabled}
        aria-busy={disabled}
        className={`${open ? 'flex' : 'hidden'} mt-4 min-w-0 flex-col gap-5 lg:flex`}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-search`} className="text-sm font-medium">
            Search bank or product
          </label>
          <input
            id={`${id}-search`}
            type="search"
            value={filters.search}
            onChange={(e) => void setFilters({ search: e.currentTarget.value })}
            className="control"
          />
        </div>
        {terms.length === 0 ? null : (
          <CheckboxGroup
            legend="Term"
            chips
            options={terms.map((t) => ({ value: t, label: `${String(t)} mo` }))}
            checked={filters.term}
            onToggle={(t) => void setFilters({ term: toggle(filters.term, t) })}
          />
        )}
        <CheckboxGroup
          legend="Institution type"
          options={INSTITUTION_KINDS.map((k) => ({ value: k, label: INSTITUTION_KIND_LABEL[k] }))}
          checked={filters.kind}
          onToggle={(k) => void setFilters({ kind: toggle(filters.kind, k) })}
        />
        <div key={revision} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <PercentInput
            label="Minimum APY, %"
            defaultValue={filters.minApy}
            onValueChange={(v) => void setFilters({ minApy: v })}
          />
          <MoneyInput
            label="Maximum to open"
            defaultValue={filters.maxOpening ?? undefined}
            onValueChange={(v) => void setFilters({ maxOpening: v })}
          />
        </div>
        <HideIneligible
          withProfile={withProfile}
          checked={filters.hide === 'ineligible'}
          onChange={(hide) => void setFilters({ hide: hide ? 'ineligible' : null })}
        />
      </fieldset>
    </form>
  );
}

/** "Hide ineligible" needs eligibility, which needs a profile: disabled without one. */
function HideIneligible(p: {
  withProfile: boolean;
  checked: boolean;
  onChange: (hide: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        disabled={!p.withProfile}
        checked={p.withProfile ? p.checked : false}
        onChange={(e) => {
          p.onChange(e.currentTarget.checked);
        }}
        className="mt-0.5 size-4 shrink-0"
      />
      <span>
        Hide products I can&apos;t open
        {p.withProfile ? null : <span className="text-muted"> (add your profile first)</span>}
      </span>
    </label>
  );
}

interface CheckboxGroupProps<T extends string | number> {
  legend: string;
  options: readonly { value: T; label: string }[];
  checked: readonly T[];
  onToggle: (value: T) => void;
  /** Toggle chips instead of a list: still checkboxes, so the state is announced. */
  chips?: boolean;
}

// the checkbox is transparent and covers the chip, so a click (and a test's check()) lands on it;
// the chip shows its checked and focus state
const CHIP =
  'relative inline-flex h-8 cursor-pointer items-center rounded-md border border-border px-3 text-sm tabular-nums has-checked:border-accent has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-disabled:cursor-not-allowed has-disabled:opacity-60';

function CheckboxGroup<T extends string | number>({
  legend,
  options,
  checked,
  onToggle,
  chips = false,
}: CheckboxGroupProps<T>) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div
        className={chips ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-x-4 gap-y-2 lg:flex-col'}
      >
        {options.map((o) => (
          <label key={o.value} className={chips ? CHIP : 'flex items-center gap-2 text-sm'}>
            <input
              type="checkbox"
              checked={checked.includes(o.value)}
              onChange={() => {
                onToggle(o.value);
              }}
              className={chips ? 'absolute inset-0 cursor-pointer opacity-0' : 'size-4'}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
