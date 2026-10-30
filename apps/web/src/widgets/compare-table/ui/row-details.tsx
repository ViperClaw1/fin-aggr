'use client';

// An expanded row: who holds the money (SafetyBadge), whether the user can open it and why
// (CompatibilityBadge, full), and the after-tax math with every assumption (ExplainMath, AC-3).
// The engine's steps and assumptions are shown as is; the profile adds the defaults it filled in.
import type { Id, Institution } from '@fa/contracts';
import Link from 'next/link';
import { SafetyBadge } from '@/entities/institution';
import { defaultAssumptions, useProfileDraft } from '@/entities/profile';
import { CompatibilityBadge } from '@/entities/rule';
import { ExplainMath } from '@/shared/ui/explain-math';
import type { Row } from '../model/order';

export type InstitutionDetails = ReadonlyMap<
  Id,
  Pick<Institution, 'name' | 'kind' | 'partnerInstitutionIds'>
>;

interface RowDetailsProps {
  row: Row;
  institutions: InstitutionDetails;
  taxYear: number;
}

export function RowDetails({ row, institutions, taxYear }: RowDetailsProps) {
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
