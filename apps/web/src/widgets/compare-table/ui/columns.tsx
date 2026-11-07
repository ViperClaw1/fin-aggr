'use client';

// Columns of the compare table. Six visible columns: bank and product share the first, and net
// yield sits under net interest. Sort keys stay the feature's SortKey. Calculated cells carry
// data-assumption (AC-3).
import {
  compareRate,
  formatSignedRate,
  formatUsd,
  formatUsdShort,
  type Cents,
  type Product,
} from '@fa/contracts';
import type { NetYieldResult } from '@fa/engine';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FactValue } from '@/entities/fact';
import { INSTITUTION_KIND_LABEL } from '@/entities/institution';
import { headlineApy } from '@/entities/product';
import type { ProfileFormField } from '@/entities/profile';
import type { InstitutionIndex, SortKey } from '@/features/filter-products';
import type { OpenCitation } from '@/features/open-citation';
import type { Column } from '@/shared/ui/data-table';
import { position } from '@/shared/ui/charts';
import { RateValue } from '@/shared/ui/rate-value';
import { profileFormField } from '../model/needs-data';
import { roundPercentText } from '../model/percent-display';
import type { Row } from '../model/order';

const FitMark = dynamic(() => import('./fit-mark').then((mod) => mod.FitMark), {
  loading: () => <span className="inline-block size-4" />,
});

type TableColumn = Column<Row> & { id: SortKey | 'product' | 'eligibility' };

const BASE_KEYS: SortKey[] = ['bank', 'term', 'apy', 'minOpening'];
const NET_KEYS: SortKey[] = ['netInterest', 'netYield'];

export const shownSortKeys = (withProfile: boolean): SortKey[] =>
  withProfile ? [...BASE_KEYS, ...NET_KEYS] : BASE_KEYS;

const netInterest = (row: Row): number =>
  row.ranked?.netYield?.netInterest ?? Number.MIN_SAFE_INTEGER;

const netOf = (row: Row): NetYieldResult | null => row.ranked?.netYield ?? null;

export function sortByNetInterest(rows: readonly Row[], direction: 'asc' | 'desc'): Row[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const byValue = sign * (netInterest(a) - netInterest(b));
    if (byValue !== 0) return byValue;
    if (a.product.id === b.product.id) return 0;
    return a.product.id < b.product.id ? -1 : 1;
  });
}

export function maxNetInterest(rows: readonly Row[], hidden: ReadonlySet<string>): Cents | null {
  let max: Cents | null = null;
  for (const row of rows) {
    if (hidden.has(row.product.id)) continue;
    const net = row.ranked?.group === 'eligible' ? row.ranked.netYield?.netInterest : undefined;
    if (net === undefined) continue;
    if (max === null || net > max) max = net;
  }
  return max;
}

interface ColumnOptions {
  institutions: InstitutionIndex;
  nowFor: (product: Pick<Product, 'category' | 'provenance'>) => Date;
  withProfile: boolean;
  onOpen: ((ref: OpenCitation) => void) | null;
  onOpenProfile: ((field: ProfileFormField) => void) | null;
  netScale: Cents | null;
}

export function columns(options: ColumnOptions): TableColumn[] {
  const bank = (row: Row): string =>
    options.institutions.get(row.product.institutionId)?.name ?? 'Unknown bank';
  return [
    {
      id: 'bank',
      header: 'Bank',
      cell: (row) => {
        const kind = options.institutions.get(row.product.institutionId)?.kind;
        return (
          <span className="block min-w-0">
            <span data-bank className="block font-medium">
              {bank(row)}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-2">
              <Link
                href={`/product/${row.product.id}`}
                prefetch={false}
                className="text-accent underline"
              >
                {row.product.name}
              </Link>
              {kind === undefined ? null : (
                <span
                  data-secondary
                  className="inline-flex rounded-sm border border-divider px-1.5 py-0.5 text-xs text-muted"
                >
                  {INSTITUTION_KIND_LABEL[kind]}
                </span>
              )}
            </span>
          </span>
        );
      },
      compare: (a, b) => bank(a).localeCompare(bank(b), 'en-US'),
    },
    {
      id: 'term',
      header: 'Term',
      cell: ({ product }) =>
        product.termMonths === null ? 'No term' : `${String(product.termMonths)} mo`,
      compare: (a, b) => (a.product.termMonths ?? 0) - (b.product.termMonths ?? 0),
      align: 'end',
    },
    {
      id: 'apy',
      header: 'Top APY',
      cell: ({ product }) => (
        <FactValue
          fact={{ value: headlineApy(product), provenance: product.provenance }}
          render={(rate) => <RateValue rate={rate} />}
          now={options.nowFor(product)}
          compact
          align="end"
          {...(options.onOpen === null ? {} : { onOpenCitation: options.onOpen })}
        />
      ),
      compare: (a, b) => compareRate(headlineApy(a.product), headlineApy(b.product)),
      align: 'end',
    },
    {
      id: 'minOpening',
      header: 'Minimum to open',
      cell: (row) =>
        row.product.minOpening === 0 ? (
          <span className="text-muted">No minimum</span>
        ) : (
          formatUsdShort(row.product.minOpening)
        ),
      compare: (a, b) => a.product.minOpening - b.product.minOpening,
      align: 'end',
    },
    netColumn(options),
    fitColumn(options),
  ];
}

function AddProfile(props: {
  onOpen: ((field: ProfileFormField) => void) | null;
  field?: ProfileFormField;
  label: string;
}) {
  return (
    <button
      type="button"
      className="text-sm font-medium text-accent underline underline-offset-2 disabled:opacity-60"
      disabled={props.onOpen === null}
      onClick={() => {
        props.onOpen?.(props.field ?? 'filingStatus');
      }}
    >
      {props.label}
    </button>
  );
}

function netColumn(options: ColumnOptions): TableColumn {
  const compare = options.withProfile
    ? (a: Row, b: Row) => netInterest(a) - netInterest(b)
    : undefined;
  return {
    id: 'netInterest',
    header: 'Net interest',
    cell: (row) => {
      if (!options.withProfile || row.ranked === null) {
        return <AddProfile onOpen={options.onOpenProfile} label="Add profile" />;
      }
      const net = netOf(row);
      if (net === null) return <span className="text-sm text-danger">Not eligible</span>;
      const width =
        options.netScale !== null && net.netInterest > 0
          ? position(net.netInterest, options.netScale)
          : 0;
      const exact = formatSignedRate(net.netSimpleAnnualYield);
      return (
        <span className="inline-flex flex-col items-end gap-1" data-assumption>
          <span
            className="font-mono text-base font-semibold tabular-nums underline decoration-dotted decoration-muted underline-offset-4"
            title="Estimate based on your profile"
          >
            <RollingText text={formatUsd(net.netInterest)} />
            <span className="ml-1 font-sans text-xs font-normal text-muted no-underline">est.</span>
          </span>
          <span className="block h-1 w-28 overflow-hidden rounded-sm bg-divider" aria-hidden="true">
            <span
              className="block h-full rounded-sm bg-accent motion-safe:transition-[width] motion-safe:duration-200"
              style={{ width: `${String(width)}%` }}
            />
          </span>
          <span className="text-xs text-muted tabular-nums" title={exact}>
            {roundPercentText(exact)} net yield
          </span>
        </span>
      );
    },
    ...(compare === undefined ? {} : { compare }),
    align: 'end',
  };
}

function fitColumn(options: ColumnOptions): TableColumn {
  return {
    id: 'eligibility',
    header: 'Fit',
    cell: (row) => {
      if (row.ranked === null) return <span className="sr-only">Profile needed</span>;
      const { status, missingFields } = row.ranked.eligibility;
      if (status === 'eligible') return <FitMark fit />;
      if (status === 'ineligible') return <FitMark fit={false} />;
      const field = missingFields[0];
      return (
        <button
          type="button"
          className="inline-flex rounded-sm bg-warn-bg px-1.5 py-0.5 text-xs font-medium text-warn disabled:opacity-60"
          disabled={options.onOpenProfile === null || field === undefined}
          onClick={() => {
            if (field !== undefined) options.onOpenProfile?.(profileFormField(field));
          }}
        >
          Needs data
        </button>
      );
    },
  };
}

function RollingText({ text }: { text: string }) {
  const [rolling, setRolling] = useState(false);
  const previous = useRef(text);
  useEffect(() => {
    if (previous.current === text) return undefined;
    previous.current = text;
    setRolling(true);
    const timer = setTimeout(() => {
      setRolling(false);
    }, 200);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);
  return <span className={rolling ? 'num-roll' : undefined}>{text}</span>;
}
