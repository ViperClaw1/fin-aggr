// Columns of the compare table. Sortable columns use the feature's SortKey as their id, so the URL
// can only name a column the feature knows. The net columns exist only with a complete profile;
// their values are calculations under assumptions, marked with data-assumption (AC-3).
import { compareRate, formatUsd } from '@fa/contracts';
import type { NetYieldResult } from '@fa/engine';
import { FactValue } from '@/entities/fact';
import { INSTITUTION_KIND_LABEL } from '@/entities/institution';
import { headlineApy } from '@/entities/product';
import { CompatibilityBadge } from '@/entities/rule';
import type { InstitutionIndex, SortKey } from '@/features/filter-products';
import type { Column } from '@/shared/ui/data-table';
import { RateValue } from '@/shared/ui/rate-value';
import type { Row } from '../model/order';

type TableColumn = Column<Row> & { id: SortKey | 'product' | 'eligibility' };

const BASE_KEYS: SortKey[] = ['bank', 'term', 'apy', 'minOpening'];
const NET_KEYS: SortKey[] = ['netInterest', 'netYield'];

export const shownSortKeys = (withProfile: boolean): SortKey[] =>
  withProfile ? [...BASE_KEYS, ...NET_KEYS] : BASE_KEYS;

// ineligible rows have no net result: they sort below every number
const netInterest = (r: Row): number => r.ranked?.netYield?.netInterest ?? Number.MIN_SAFE_INTEGER;

export function columns(institutions: InstitutionIndex, now: Date, withProfile: boolean) {
  const bank = (r: Row): string =>
    institutions.get(r.product.institutionId)?.name ?? 'Unknown bank';
  const base: TableColumn[] = [
    {
      id: 'bank',
      header: 'Bank',
      cell: (r) => {
        const kind = institutions.get(r.product.institutionId)?.kind;
        return (
          <>
            <span className="block font-medium">{bank(r)}</span>
            {kind === undefined ? null : (
              // data-secondary: a second line under the name, left out when a test reads the name
              <span data-secondary className="block text-xs text-muted">
                {INSTITUTION_KIND_LABEL[kind]}
              </span>
            )}
          </>
        );
      },
      compare: (a, b) => bank(a).localeCompare(bank(b), 'en-US'),
    },
    { id: 'product', header: 'Product', cell: (r) => r.product.name },
    {
      id: 'term',
      header: 'Term',
      cell: ({ product: p }) => (p.termMonths === null ? 'No term' : `${String(p.termMonths)} mo`),
      compare: (a, b) => (a.product.termMonths ?? 0) - (b.product.termMonths ?? 0),
      align: 'end',
    },
    {
      id: 'apy',
      header: 'Top APY',
      // the product's provenance stands for its rate tiers
      cell: ({ product: p }) => (
        <FactValue
          fact={{ value: headlineApy(p), provenance: p.provenance }}
          render={(rate) => <RateValue rate={rate} />}
          now={now}
        />
      ),
      compare: (a, b) => compareRate(headlineApy(a.product), headlineApy(b.product)),
      align: 'end',
    },
    {
      id: 'minOpening',
      header: 'Minimum to open',
      cell: (r) => formatUsd(r.product.minOpening),
      compare: (a, b) => a.product.minOpening - b.product.minOpening,
      align: 'end',
    },
  ];
  return withProfile ? [...base, ...NET_COLUMNS] : base;
}

const netOf = (r: Row): NetYieldResult | null => r.ranked?.netYield ?? null;

const NET_COLUMNS: TableColumn[] = [
  {
    id: 'netInterest',
    header: 'Net interest',
    cell: (r) => {
      const net = netOf(r);
      return net === null ? (
        'Not eligible'
      ) : (
        <span data-assumption>{formatUsd(net.netInterest)}</span>
      );
    },
    compare: (a, b) => netInterest(a) - netInterest(b),
    align: 'end',
  },
  {
    id: 'netYield',
    header: 'Net yield',
    cell: (r) => {
      const net = netOf(r);
      return net === null ? (
        'Not eligible'
      ) : (
        <span data-assumption>
          <RateValue rate={net.netSimpleAnnualYield} />
        </span>
      );
    },
    // same order as net interest for one scenario (same principal and months)
    compare: (a, b) => netInterest(a) - netInterest(b),
    align: 'end',
  },
  {
    id: 'eligibility',
    header: 'Fit',
    cell: (r) =>
      r.ranked === null ? null : <CompatibilityBadge result={r.ranked.eligibility} compact />,
  },
];
