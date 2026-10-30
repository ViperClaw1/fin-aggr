'use client';

// The bank list. Data is loaded at build and passed in. Search and the kind filter run in memory;
// their state is the URL, read inside <Suspense> so the full list is in the static HTML.
import { INSTITUTION_KINDS } from '@fa/contracts';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { FactValue, freshnessNow } from '@/entities/fact';
import { INSTITUTION_KIND_LABEL, SafetyBadge } from '@/entities/institution';
import { bankPath } from '@/shared/lib/bank-param';
import { EmptyState } from '@/shared/ui/states';
import { RateValue } from '@/shared/ui/rate-value';
import type { BankListData } from '../api/load';
import { filterBanks, useBankSearch, type BankKind } from '../model/search';

interface Filters {
  query: string;
  kind: BankKind | null;
}

export function BankSearch({ items, dataset }: BankListData) {
  const [filters, setFilters] = useState<Filters | null>(null);
  return (
    <>
      <Suspense fallback={null}>
        <UrlSync onChange={setFilters} />
      </Suspense>
      <List items={items} dataset={dataset} filters={filters} />
    </>
  );
}

function UrlSync({ onChange }: { onChange: (filters: Filters) => void }) {
  const [state, setState] = useBankSearch();
  useEffect(() => {
    onChange({ query: state.bank, kind: state.bankKind });
  }, [state.bank, state.bankKind, onChange]);
  return (
    <form className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end" role="search">
      <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
        Search by name
        <input
          value={state.bank}
          onChange={(e) => {
            void setState({ bank: e.target.value });
          }}
          className="control"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Institution type
        <select
          value={state.bankKind ?? ''}
          onChange={(e) => {
            const kind = INSTITUTION_KINDS.find((item) => item === e.target.value) ?? null;
            void setState({ bankKind: kind });
          }}
          className="control"
        >
          <option value="">Any</option>
          {INSTITUTION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {INSTITUTION_KIND_LABEL[kind]}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}

function List({ items, dataset, filters }: BankListData & { filters: Filters | null }) {
  const shown = filters === null ? items : filterBanks(items, filters.query, filters.kind);
  const now = freshnessNow(dataset);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted" aria-live="polite">
        {shown.length === 1 ? '1 institution' : `${String(shown.length)} institutions`}
      </p>
      {shown.length === 0 ? (
        <EmptyState title="No institutions match.">Clear the search or choose Any type.</EmptyState>
      ) : (
        <ul className="divide-y divide-divider border-y border-divider">
          {shown.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Link href={bankPath(item.id)} prefetch={false} className="font-medium underline">
                  {item.name}
                </Link>
                <p className="mt-1 text-sm text-muted">
                  {item.productCount === 1 ? '1 product' : `${String(item.productCount)} products`}
                </p>
              </div>
              <SafetyBadge kind={item.kind} partners={item.partners} />
              {item.bestApy === null ? (
                <p className="text-sm text-muted">No product</p>
              ) : (
                <FactValue
                  fact={item.bestApy}
                  now={now}
                  render={(rate) => <RateValue rate={rate} />}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
