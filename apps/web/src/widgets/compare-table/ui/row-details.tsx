'use client';

// An expanded row: who holds the money (SafetyBadge), whether the user can open it and why
// (CompatibilityBadge, full), and the after-tax math with every assumption (ExplainMath, AC-3).
// The engine's steps and assumptions are shown as is; the profile adds the defaults it filled in.
import { formatRate, type EarlyWithdrawal, type Id, type Institution } from '@fa/contracts';
import Link from 'next/link';
import { FactValue } from '@/entities/fact';
import { SafetyBadge } from '@/entities/institution';
import { defaultAssumptions, useProfileDraft } from '@/entities/profile';
import { CompatibilityBadge } from '@/entities/rule';
import type { OpenCitation } from '@/features/open-citation';
import { ExplainMath } from '@/shared/ui/explain-math';
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
      return `${formatRate(penalty.rate)} of the principal`;
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
  const issuer = institutions.get(row.product.institutionId);
  const partners = (issuer?.partnerInstitutionIds ?? []).map((id) => ({
    id,
    name: institutions.get(id)?.name ?? 'Unknown bank',
  }));
  const net = row.ranked?.netYield ?? null;
  return (
    <div className="flex flex-col gap-4 p-2">
      <div className="flex flex-wrap items-start gap-3">
        {issuer === undefined ? null : <SafetyBadge kind={issuer.kind} partners={partners} />}
        {row.ranked === null ? null : <CompatibilityBadge result={row.ranked.eligibility} />}
      </div>
      {row.ranked === null ? (
        <p className="text-sm text-muted">Add your profile to see the after-tax math.</p>
      ) : null}
      {net === null ? null : (
        <ExplainMath
          steps={net.steps}
          assumptions={[...net.assumptions, ...defaultAssumptions(draft, taxYear)]}
          headingLevel={3}
        />
      )}
      <p>
        <FactValue
          fact={row.product.earlyWithdrawal}
          render={penaltyText}
          {...(onOpen === null ? {} : { onOpenCitation: onOpen })}
        />
      </p>
      <p>
        <Link
          href={`/product/${row.product.id}`}
          prefetch={false}
          className="text-sm text-accent underline"
        >
          Full breakdown
        </Link>
      </p>
    </div>
  );
}
