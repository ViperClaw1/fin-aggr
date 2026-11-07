'use client';

// Expanded row: the after-tax waterfall first, then a few facts. The engine steps and the
// assumptions stay collapsed. Insurance wording stays in SafetyBadge (no extra claim here).
import {
  formatRateDisplay,
  formatSignedRate,
  formatUsd,
  type EarlyWithdrawal,
  type Id,
  type Institution,
} from '@fa/contracts';
import Link from 'next/link';
import { FactValue, SourceCitation } from '@/entities/fact';
import { SafetyBadge } from '@/entities/institution';
import { headlineApy } from '@/entities/product';
import { defaultAssumptions, useProfileDraft } from '@/entities/profile';
import { CompatibilityBadge } from '@/entities/rule';
import type { OpenCitation } from '@/features/open-citation';
import type { Row } from '../model/order';

function penaltyText(penalty: EarlyWithdrawal): string {
  switch (penalty.kind) {
    case 'none':
      return 'None';
    case 'days_of_interest':
      return `${String(penalty.days)} days of interest`;
    case 'months_of_interest':
      return `${String(penalty.months)} months of interest`;
    case 'percent_of_principal':
      return `${formatSignedRate(penalty.rate)} of the principal`;
  }
}

export type InstitutionDetails = ReadonlyMap<
  Id,
  Pick<Institution, 'name' | 'kind' | 'partnerInstitutionIds'>
>;

interface RowDetailsProps {
  row: Row;
  institutions: InstitutionDetails;
  taxYear: number;
  onOpen: ((ref: OpenCitation) => void) | null;
}

export function RowDetails({ row, institutions, taxYear, onOpen }: RowDetailsProps) {
  const draft = useProfileDraft();
  const net = row.ranked?.netYield ?? null;
  const assumptions =
    net === null ? [] : [...net.assumptions, ...defaultAssumptions(draft, taxYear)];
  return (
    <div className="flex flex-col gap-4">
      {row.ranked === null ? (
        <p className="text-sm text-muted">Add your profile to see the after-tax math.</p>
      ) : null}
      {net === null ? null : <Waterfall net={net} />}
      <FactGrid row={row} institutions={institutions} onOpen={onOpen} />
      {net === null ? null : <Calculation steps={net.steps} />}
      <AssumptionList items={assumptions} />
      <SourceCitation
        provenance={row.product.provenance}
        variant="line"
        {...(onOpen === null ? {} : { onOpen })}
      />
      <p>
        <Link
          href={`/product/${row.product.id}`}
          prefetch={false}
          className="text-sm font-medium text-accent underline"
        >
          Full breakdown →
        </Link>
      </p>
    </div>
  );
}

function FactGrid(props: {
  row: Row;
  institutions: InstitutionDetails;
  onOpen: ((ref: OpenCitation) => void) | null;
}) {
  const issuer = props.institutions.get(props.row.product.institutionId);
  const partners = (issuer?.partnerInstitutionIds ?? []).map((id) => ({
    id,
    name: props.institutions.get(id)?.name ?? 'Unknown bank',
  }));
  const apy = formatRateDisplay(headlineApy(props.row.product));
  const tier =
    props.row.product.tierMode === 'whole_balance'
      ? `whole balance at ${apy}`
      : `marginal tiers, top ${apy}`;
  const citation = props.onOpen === null ? {} : { onOpenCitation: props.onOpen };
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <dt className="text-xs text-muted">Early withdrawal penalty</dt>
        <dd className="text-sm">
          <FactValue fact={props.row.product.earlyWithdrawal} render={penaltyText} {...citation} />
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Held at</dt>
        <dd className="mt-1">
          {issuer === undefined ? (
            'Unknown bank'
          ) : (
            <SafetyBadge kind={issuer.kind} partners={partners} />
          )}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Eligibility</dt>
        <dd className="mt-1 text-sm">
          {props.row.ranked === null ? (
            'Add your profile'
          ) : (
            <CompatibilityBadge result={props.row.ranked.eligibility} compact />
          )}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Tier</dt>
        <dd className="text-sm">{tier}</dd>
      </div>
    </dl>
  );
}

function Calculation({
  steps,
}: {
  steps: readonly { id: string; label: string; result: string; formula: string }[];
}) {
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">How this is calculated</summary>
      <section aria-label="How this is calculated" data-assumption="" className="mt-3">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {steps.map((step) => (
            <li key={step.id}>
              <p>
                {step.label}: <strong className="tabular-nums">{step.result}</strong>
              </p>
              <p className="font-mono text-xs text-muted">{step.formula}</p>
            </li>
          ))}
        </ol>
      </section>
    </details>
  );
}

function AssumptionList({ items }: { items: readonly { id: string; text: string }[] }) {
  if (items.length === 0) return null;
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">Assumptions ({items.length})</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {items.map((assumption) => (
          <li key={assumption.id}>{assumption.text}</li>
        ))}
      </ul>
    </details>
  );
}

function Waterfall({ net }: { net: NonNullable<Row['ranked']>['netYield'] }) {
  if (net === null) return null;
  const steps = [
    {
      key: 'gross',
      label: 'Gross interest',
      text: formatUsd(net.grossInterest),
      cents: net.grossInterest,
    },
    {
      key: 'penalty',
      label: '− Penalty',
      text: formatUsd(net.earlyWithdrawalPenalty),
      cents: net.earlyWithdrawalPenalty,
    },
    {
      key: 'federal',
      label: '− Federal tax',
      text: formatUsd(net.federalTax),
      cents: net.federalTax,
    },
    { key: 'state', label: '− State', text: formatUsd(net.stateTax), cents: net.stateTax },
    { key: 'city', label: '− City', text: formatUsd(net.localTax), cents: net.localTax },
    {
      key: 'keep',
      label: '= You keep',
      text: formatUsd(net.netInterest),
      cents: Math.max(0, net.netInterest),
    },
  ];
  return (
    <div>
      <h3 className="text-sm font-medium">Where your interest goes</h3>
      <ol className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {steps.map((step) => (
          <li key={step.key} className="rounded-md border border-divider px-2 py-1.5">
            <span className="block text-xs text-muted">{step.label}</span>
            <span className="font-mono text-sm font-semibold tabular-nums">{step.text}</span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex h-2 overflow-hidden rounded-sm" aria-hidden="true">
        {steps.map((step) =>
          step.key === 'gross' || step.cents <= 0 ? null : (
            <span
              key={step.key}
              className={step.key === 'keep' ? 'bg-accent' : 'bg-foreground/50'}
              style={{ flexGrow: step.cents }}
            />
          ),
        )}
      </div>
    </div>
  );
}
