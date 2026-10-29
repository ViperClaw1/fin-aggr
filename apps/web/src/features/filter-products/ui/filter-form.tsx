'use client';

// The filter form of the compare table. Every change goes to the URL at once (search is debounced
// by its parser); the table filters in memory. Never filled from the profile (ADR-004). Reset
// clears every filter key; the money and rate fields are uncontrolled, so they remount.
import { INSTITUTION_KINDS } from '@fa/contracts';
import { useId, useState } from 'react';
import { INSTITUTION_KIND_LABEL } from '@/entities/institution';
import { MoneyInput, PercentInput } from '@/shared/ui/inputs';
import { useProductFilters } from '../model/search-params';

interface FilterFormProps {
  /** the terms present in the catalog, ascending */
  terms: readonly number[];
  /** "hide ineligible" needs eligibility, which needs a profile */
  withProfile: boolean;
}

const toggle = <T,>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export function FilterForm({ terms, withProfile }: FilterFormProps) {
  const [filters, setFilters] = useProductFilters();
  const [revision, setRevision] = useState(0);
  const id = useId();
  return (
    <form
      aria-label="Filters"
      className="flex flex-col gap-4 rounded border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-search`} className="font-medium">
          Search bank or product
        </label>
        <input
          id={`${id}-search`}
          type="search"
          value={filters.search}
          onChange={(e) => void setFilters({ search: e.currentTarget.value })}
          className="rounded border border-border bg-background px-2 py-1"
        />
      </div>
      {terms.length === 0 ? null : (
        <CheckboxGroup
          legend="Term"
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
      <div key={revision} className="grid gap-4 sm:grid-cols-2">
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
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          disabled={!withProfile}
          checked={withProfile ? filters.hide === 'ineligible' : false}
          onChange={(e) => void setFilters({ hide: e.currentTarget.checked ? 'ineligible' : null })}
        />
        Hide products I can&apos;t open{withProfile ? '' : ' (add your profile first)'}
      </label>
      <button
        type="button"
        className="self-start rounded border border-border px-3 py-1.5"
        onClick={() => {
          void setFilters(null);
          setRevision((r) => r + 1);
        }}
      >
        Reset filters
      </button>
    </form>
  );
}

interface CheckboxGroupProps<T extends string | number> {
  legend: string;
  options: readonly { value: T; label: string }[];
  checked: readonly T[];
  onToggle: (value: T) => void;
}

function CheckboxGroup<T extends string | number>({
  legend,
  options,
  checked,
  onToggle,
}: CheckboxGroupProps<T>) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={checked.includes(o.value)}
              onChange={() => {
                onToggle(o.value);
              }}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
