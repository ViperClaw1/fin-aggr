'use client';

import { formatSignedRate, formatUsd, formatUsdShort, type Cents } from '@fa/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { FactValue } from '@/entities/fact';
import { headlineApy } from '@/entities/product';
import type { ProfileFormField } from '@/entities/profile';
import type { OpenCitation } from '@/features/open-citation';
import { position } from '@/shared/ui/charts';
import { RateValue } from '@/shared/ui/rate-value';
import { roundPercentText } from '../model/percent-display';
import type { Row } from '../model/order';
import { RowDetails, type InstitutionDetails } from './row-details';

interface ResultCardsProps {
  caption: string;
  rows: readonly Row[];
  hidden: ReadonlySet<string>;
  institutions: InstitutionDetails;
  withProfile: boolean;
  netScale: Cents | null;
  taxYear: number;
  nowFor: (product: Row['product']) => Date;
  onOpen: ((ref: OpenCitation) => void) | null;
  onOpenProfile: ((field: ProfileFormField) => void) | null;
}

export function ResultCards(props: ResultCardsProps) {
  const rows = props.rows.filter((row) => !props.hidden.has(row.product.id));
  return (
    <ul className="flex flex-col gap-3" aria-label={props.caption}>
      {rows.map((row) => (
        <li key={row.product.id}>
          <Card {...props} row={row} />
        </li>
      ))}
    </ul>
  );
}

function Card(props: ResultCardsProps & { row: Row }) {
  const { row } = props;
  const bank = props.institutions.get(row.product.institutionId)?.name ?? 'Unknown bank';
  const net = row.ranked?.netYield ?? null;
  const [open, setOpen] = useState(false);
  const dim = row.ranked?.group === 'ineligible' ? 'opacity-60' : '';
  return (
    <article className={`rounded-lg border border-divider p-3 ${dim}`}>
      <p className="font-medium">{bank}</p>
      <p>
        <Link
          href={`/product/${row.product.id}`}
          prefetch={false}
          className="text-accent underline"
        >
          {row.product.name}
        </Link>
      </p>
      <div className="mt-2">
        <NetFigure
          row={row}
          net={net}
          canOpenProfile={props.onOpenProfile !== null}
          onOpenProfile={() => {
            props.onOpenProfile?.('filingStatus');
          }}
        />
        {net === null ? null : <NetBar net={net.netInterest} scale={props.netScale} />}
      </div>
      <CardFacts row={row} net={net} now={props.nowFor(row.product)} onOpen={props.onOpen} />
      <Fit row={row} />
      <CardDetails open={open} onOpen={setOpen} row={row} props={props} />
    </article>
  );
}

function CardFacts(props: {
  row: Row;
  net: NonNullable<Row['ranked']>['netYield'];
  now: Date;
  onOpen: ResultCardsProps['onOpen'];
}) {
  const term = props.row.product.termMonths;
  const opening = props.row.product.minOpening;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
      <FactValue
        fact={{ value: headlineApy(props.row.product), provenance: props.row.product.provenance }}
        render={(rate) => <RateValue rate={rate} />}
        now={props.now}
        compact
        {...(props.onOpen === null ? {} : { onOpenCitation: props.onOpen })}
      />
      <span aria-hidden="true">·</span>
      <span>{term === null ? 'No term' : `${String(term)} mo`}</span>
      <span aria-hidden="true">·</span>
      <span>{opening === 0 ? 'No minimum' : formatUsdShort(opening)}</span>
      {props.net === null ? null : (
        <span title={formatSignedRate(props.net.netSimpleAnnualYield)}>
          · {roundPercentText(formatSignedRate(props.net.netSimpleAnnualYield))} net yield
        </span>
      )}
    </div>
  );
}

function CardDetails(props: {
  open: boolean;
  onOpen: (open: boolean) => void;
  row: Row;
  props: ResultCardsProps;
}) {
  return (
    <details
      className="mt-2"
      onToggle={(event) => {
        props.onOpen(event.currentTarget.open);
      }}
    >
      <summary className="cursor-pointer text-sm font-medium">Details</summary>
      {props.open ? (
        <div className="mt-3">
          <RowDetails
            row={props.row}
            institutions={props.props.institutions}
            taxYear={props.props.taxYear}
            onOpen={props.props.onOpen}
          />
        </div>
      ) : null}
    </details>
  );
}

function NetFigure(props: {
  row: Row;
  net: NonNullable<Row['ranked']>['netYield'];
  canOpenProfile: boolean;
  onOpenProfile: () => void;
}) {
  if (props.net === null) {
    if (props.row.ranked !== null) return <p className="text-sm text-danger">Not eligible</p>;
    return (
      <button
        type="button"
        className="text-sm font-medium text-accent underline"
        disabled={!props.canOpenProfile}
        onClick={props.onOpenProfile}
      >
        Add profile
      </button>
    );
  }
  return (
    <p className="font-mono text-xl font-semibold tabular-nums" data-assumption>
      <span
        title="Estimate based on your profile"
        className="underline decoration-dotted underline-offset-4"
      >
        {formatUsd(props.net.netInterest)}
      </span>
      <span className="ml-1 font-sans text-xs font-normal text-muted">est.</span>
    </p>
  );
}

function NetBar(props: { net: Cents; scale: Cents | null }) {
  const width = props.scale !== null && props.net > 0 ? position(props.net, props.scale) : 0;
  return (
    <span
      className="mt-1 block h-1 w-full overflow-hidden rounded-sm bg-divider"
      aria-hidden="true"
    >
      <span className="block h-full bg-accent" style={{ width: `${String(width)}%` }} />
    </span>
  );
}

function Fit({ row }: { row: Row }) {
  if (row.ranked === null || row.ranked.group === 'eligible') return null;
  if (row.ranked.group === 'ineligible') {
    return (
      <p className="mt-2">
        <span className="inline-flex rounded-sm bg-danger-bg px-1.5 py-0.5 text-xs font-medium text-danger">
          Not eligible
        </span>
      </p>
    );
  }
  return (
    <p className="mt-2">
      <span className="inline-flex rounded-sm bg-warn-bg px-1.5 py-0.5 text-xs font-medium text-warn">
        Needs data
      </span>
    </p>
  );
}
