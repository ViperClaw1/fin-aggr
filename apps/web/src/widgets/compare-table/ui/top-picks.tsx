'use client';

import { compareRate, formatSignedRate, formatUsd, type Cents } from '@fa/contracts';
import Link from 'next/link';
import { headlineApy } from '@/entities/product';
import type { InstitutionDetails } from './row-details';
import { roundPercentText } from '../model/percent-display';
import type { Row } from '../model/order';

interface TopPicksProps {
  rows: readonly Row[];
  hidden: ReadonlySet<string>;
  institutions: InstitutionDetails;
  withProfile: boolean;
}

function visible(rows: readonly Row[], hidden: ReadonlySet<string>): Row[] {
  return rows.filter((row) => !hidden.has(row.product.id));
}

function byApy(rows: readonly Row[]): Row | null {
  let best: Row | null = null;
  for (const row of rows) {
    if (best === null || compareRate(headlineApy(row.product), headlineApy(best.product)) > 0) {
      best = row;
    }
  }
  return best;
}

function PickCard(props: {
  eyebrow: string;
  row: Row;
  institutions: InstitutionDetails;
  figure: string;
  hint: string;
}) {
  const bank = props.institutions.get(props.row.product.institutionId)?.name ?? 'Unknown bank';
  return (
    <article className="flex h-36 flex-col overflow-hidden rounded-lg border border-divider bg-background p-3">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{props.eyebrow}</p>
      <p className="mt-1 truncate text-sm font-medium">{bank}</p>
      <p className="truncate text-sm">
        <Link href={`/product/${props.row.product.id}`} prefetch={false} className="underline">
          {props.row.product.name}
        </Link>
      </p>
      <p className="mt-auto font-mono text-lg font-semibold tabular-nums">{props.figure}</p>
      <p className="flex items-baseline justify-between gap-2 text-xs text-muted">
        <span className="truncate">{props.hint}</span>
        <Link
          href={`/product/${props.row.product.id}`}
          prefetch={false}
          className="shrink-0 text-accent underline"
        >
          View
        </Link>
      </p>
    </article>
  );
}

function keptInterest(row: Row): Cents | null {
  const net = row.ranked?.group === 'eligible' ? row.ranked.netYield : null;
  return net?.netInterest ?? null;
}

function mostAfterTax(rows: readonly Row[]): Row | null {
  let best: Row | null = null;
  let bestKept = -1;
  for (const row of rows) {
    const kept = keptInterest(row);
    if (kept === null || kept <= bestKept) continue;
    best = row;
    bestKept = kept;
  }
  return best;
}

function netYieldHint(row: Row): string | null {
  const net = row.ranked?.netYield ?? null;
  if (net === null) return null;
  return `${roundPercentText(formatSignedRate(net.netSimpleAnnualYield))} net yield · est.`;
}

export function TopPicks({ rows, hidden, institutions, withProfile }: TopPicksProps) {
  const shown = visible(rows, hidden);
  const apy = byApy(shown);
  const open = byApy(shown.filter((row) => row.product.minOpening === 0));
  const afterTax = withProfile ? mostAfterTax(shown) : null;
  if (apy === null && open === null && afterTax === null) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <AfterTaxCard row={afterTax} institutions={institutions} />
      <ApyCard row={apy} institutions={institutions} />
      <OpenCard row={open} institutions={institutions} />
    </div>
  );
}

function AfterTaxCard(props: { row: Row | null; institutions: InstitutionDetails }) {
  if (props.row === null) return null;
  const kept = keptInterest(props.row);
  const hint = netYieldHint(props.row);
  if (kept === null || hint === null) return null;
  return (
    <PickCard
      eyebrow="Most after tax"
      row={props.row}
      institutions={props.institutions}
      figure={formatUsd(kept)}
      hint={hint}
    />
  );
}

function ApyCard(props: { row: Row | null; institutions: InstitutionDetails }) {
  if (props.row === null) return null;
  const term = props.row.product.termMonths;
  return (
    <PickCard
      eyebrow="Highest APY"
      row={props.row}
      institutions={props.institutions}
      figure={formatSignedRate(headlineApy(props.row.product))}
      hint={term === null ? 'No term' : `${String(term)} mo`}
    />
  );
}

function OpenCard(props: { row: Row | null; institutions: InstitutionDetails }) {
  if (props.row === null) return null;
  return (
    <PickCard
      eyebrow="No minimum to open"
      row={props.row}
      institutions={props.institutions}
      figure="No minimum"
      hint={formatSignedRate(headlineApy(props.row.product))}
    />
  );
}
