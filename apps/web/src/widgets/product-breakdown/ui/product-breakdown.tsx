'use client';

// Product page body. Data arrives as props from the build (ADR-016). The profile and the
// calculation stay in the browser (ADR-004, ADR-008). URL hooks (the drawer, the citation) sit in
// UrlSync inside <Suspense>, so the terms and the assumptions are in the static HTML.
import { formatUsd, type Assumption } from '@fa/contracts';
import type { NetYieldResult } from '@fa/engine';
import Link from 'next/link';
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { freshnessNow } from '@/entities/fact';
import { SafetyBadge } from '@/entities/institution';
import { defaultAssumptions, useCompleteProfile, useProfileDraft } from '@/entities/profile';
import { CompatibilityBadge } from '@/entities/rule';
import { useProductMath } from '@/features/compute-net-yield';
import { assumptionField, useEditAssumptions } from '@/features/edit-assumptions';
import { useOpenCitation, type OpenCitation } from '@/features/open-citation';
import { ExplainMath } from '@/shared/ui/explain-math';
import { MetricCard } from '@/shared/ui/metric-card';
import { RateValue } from '@/shared/ui/rate-value';
import { bankPath } from '@/shared/lib/bank-param';
import type { ProductData } from '../api/prefetch';
import { Conditions } from './conditions';

interface Handlers {
  onEdit: (id: string) => void;
  onOpen: (ref: OpenCitation) => void;
}

/** Hides Edit where the profile form has no field, so the button always does something. */
function offerKnownEdits(assumptions: readonly Assumption[]): Assumption[] {
  return assumptions.map((assumption) =>
    assumption.editable && assumptionField(assumption.id) === null
      ? { ...assumption, editable: false }
      : assumption,
  );
}

export function ProductBreakdown(data: ProductData) {
  const [handlers, setHandlers] = useState<Handlers | null>(null);
  return (
    <>
      <Suspense fallback={null}>
        <UrlSync onChange={setHandlers} />
      </Suspense>
      <View data={data} handlers={handlers} />
    </>
  );
}

function UrlSync({ onChange }: { onChange: (handlers: Handlers) => void }) {
  const edit = useEditAssumptions();
  const { open } = useOpenCitation();
  const editRef = useRef(edit);
  const openRef = useRef(open);
  useLayoutEffect(() => {
    editRef.current = edit;
    openRef.current = open;
  });
  useEffect(() => {
    onChange({
      onEdit: (id) => {
        editRef.current(id);
      },
      onOpen: (ref) => {
        openRef.current(ref);
      },
    });
  }, [onChange]);
  return null;
}

function View({ data, handlers }: { data: ProductData; handlers: Handlers | null }) {
  const { product, institution, partners, facts, dataset, taxTables } = data;
  const draft = useProfileDraft();
  const profile = useCompleteProfile(taxTables.taxYear);
  const { eligibility, net } = useProductMath(product, draft, profile, taxTables);
  const assumptions = offerKnownEdits([
    ...(net?.assumptions ?? []),
    ...defaultAssumptions(draft, taxTables.taxYear),
  ]);
  const now = freshnessNow(dataset);
  return (
    <article className="flex min-w-0 flex-col gap-8">
      <Conditions
        product={product}
        facts={facts}
        now={now}
        onOpen={handlers === null ? undefined : handlers.onOpen}
      />
      <AfterTax
        net={net}
        assumptions={assumptions}
        onEdit={handlers === null ? undefined : handlers.onEdit}
      />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Can you open this</h2>
        {eligibility === null ? (
          <p className="text-sm text-muted">Checking the rules…</p>
        ) : (
          <CompatibilityBadge result={eligibility} />
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Who holds the money</h2>
        <SafetyBadge kind={institution.kind} partners={partners} />
        <p>
          <Link
            href={bankPath(institution.id)}
            prefetch={false}
            className="text-sm text-accent underline"
          >
            About {institution.name}
          </Link>
        </p>
      </section>
    </article>
  );
}

function AfterTax({
  net,
  assumptions,
  onEdit,
}: {
  net: NetYieldResult | null;
  assumptions: readonly Assumption[];
  onEdit: ((id: string) => void) | undefined;
}) {
  const negative = net !== null && net.netInterest < 0;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">After tax</h2>
      {net === null ? (
        <p className="text-sm text-muted">
          The after-tax steps appear once your profile is complete. Until then the assumptions below
          are the ones that calculation uses.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="Net interest"
            value={<span data-assumption>{formatUsd(net.netInterest)}</span>}
            hint="After the early withdrawal penalty and tax."
            {...(negative
              ? { tone: 'danger' as const, toneLabel: 'The penalty is larger than the interest.' }
              : { tone: 'neutral' as const })}
          />
          <MetricCard
            label="Net yield"
            hint="Simple annual yield on the deposit."
            value={
              <span data-assumption>
                <RateValue rate={net.netSimpleAnnualYield} />
              </span>
            }
          />
        </div>
      )}
      {net === null
        ? null
        : net.warnings.map((warning) => (
            <p key={warning} role="status" className="text-sm">
              {warning}
            </p>
          ))}
      <ExplainMath
        steps={net?.steps ?? []}
        assumptions={assumptions}
        headingLevel={3}
        {...(onEdit === undefined ? {} : { onEditAssumption: onEdit })}
      />
    </section>
  );
}
