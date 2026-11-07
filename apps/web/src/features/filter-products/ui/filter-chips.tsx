'use client';

import { formatRate, formatUsdShort } from '@fa/contracts';
import { INSTITUTION_KIND_LABEL } from '@/entities/institution';
import type { ProductFilters } from '../model/search-params';

type SetFilters = (patch: Partial<ProductFilters> | null) => unknown;

interface Chip {
  key: string;
  label: string;
  clear: Partial<ProductFilters>;
}

function chipsFor(filters: ProductFilters): Chip[] {
  const chips: Chip[] = [];
  if (filters.search !== '') {
    chips.push({ key: 'search', label: filters.search, clear: { search: '' } });
  }
  const min = filters.term[0];
  const max = filters.term[filters.term.length - 1];
  if (min !== undefined && max !== undefined) {
    chips.push({
      key: 'term',
      label: min === max ? `${String(min)} mo` : `${String(min)}–${String(max)} mo`,
      clear: { term: [] },
    });
  }
  if (filters.minApy !== null) {
    chips.push({
      key: 'apy',
      label: `APY ≥ ${formatRate(filters.minApy)}`,
      clear: { minApy: null },
    });
  }
  if (filters.maxOpening !== null) {
    chips.push({
      key: 'open',
      label:
        filters.maxOpening === 0
          ? 'No minimum'
          : `Opens at ${formatUsdShort(filters.maxOpening)} or less`,
      clear: { maxOpening: null },
    });
  }
  for (const kind of filters.kind) {
    chips.push({
      key: kind,
      label: INSTITUTION_KIND_LABEL[kind],
      clear: { kind: filters.kind.filter((item) => item !== kind) },
    });
  }
  if (filters.hide !== null) {
    chips.push({ key: 'hide', label: "Hide products I can't open", clear: { hide: null } });
  }
  return chips;
}

export function FilterChips({
  filters,
  disabled,
  onChange,
}: {
  filters: ProductFilters;
  disabled: boolean;
  onChange: SetFilters;
}) {
  const chips = chipsFor(filters);
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Applied filters">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            disabled={disabled}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-60"
            onClick={() => {
              void onChange(chip.clear);
            }}
          >
            {chip.label}
            <span aria-hidden="true">×</span>
            <span className="sr-only">Remove filter {chip.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
