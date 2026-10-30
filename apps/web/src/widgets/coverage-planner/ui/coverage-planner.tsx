'use client';

// Coverage planner. The form is features/plan-coverage; this widget draws the result.
// Insurance wording is a DRAFT pending legal review.
import { formatUsd } from '@fa/contracts';
import { FactValue } from '@/entities/fact';
import { AccountRows, usePlanCoverage } from '@/features/plan-coverage';
import { BulletChart } from '@/shared/ui/charts';
import { ExplainMath } from '@/shared/ui/explain-math';
import { MetricCard } from '@/shared/ui/metric-card';
import type { CoverageData } from '../api/load';

const REGULATORS = ['FDIC', 'NCUA'] as const;

export function CoveragePlanner({ institutions, rules }: CoverageData) {
  const form = usePlanCoverage(institutions, rules);
  const plan = form.plan;
  return (
    <div className="flex flex-col gap-8">
      <p
        role="note"
        className="rounded-md border border-warn bg-warn-bg px-3 py-2 text-sm text-warn"
      >
        Draft, pending legal review. This estimate is not a determination of insurance coverage.
      </p>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Limit per owner</h2>
        <ul className="space-y-2">
          {REGULATORS.map((regulator) => (
            <li key={regulator}>
              <FactValue
                fact={{
                  value: rules.byRegulator[regulator].limitPerOwnerPerInstitutionPerCategory,
                  provenance: rules.provenance,
                }}
                render={(cents) =>
                  `${regulator} ${formatUsd(cents)} per owner, per institution, per ownership category`
                }
              />
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          The reference data is unverified. A joint account is estimated with two owners, so its
          limit is twice the figure above. No amount is held back for interest.
        </p>
      </section>
      <AccountRows
        rows={form.rows}
        institutions={institutions}
        onAdd={form.add}
        onRemove={form.remove}
        onChange={form.update}
        takeFocus={form.takeFocus}
      />
      {plan === null ? null : <Result plan={plan} />}
    </div>
  );
}

function Result({ plan }: { plan: NonNullable<ReturnType<typeof usePlanCoverage>['plan']> }) {
  const uninsured = plan.uninsuredTotal > 0;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Result</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="Insured"
          value={<span data-assumption>{formatUsd(plan.insuredTotal)}</span>}
        />
        <MetricCard
          label="Not insured"
          value={<span data-assumption>{formatUsd(plan.uninsuredTotal)}</span>}
          {...(uninsured
            ? { tone: 'warn' as const, toneLabel: 'Some of the balance is above the limit.' }
            : { tone: 'neutral' as const })}
        />
      </div>
      <ul className="flex flex-col gap-4">
        {plan.allocations.map((allocation) => (
          <li key={`${allocation.institutionId}-${allocation.category}`}>
            <BulletChart
              kind="usd"
              label={`${allocation.name}, ${allocation.category}`}
              max={allocation.limit}
              value={allocation.amount}
            />
          </li>
        ))}
      </ul>
      {plan.warnings.map((warning) => (
        <p key={warning} role="status" className="text-sm">
          {warning}
        </p>
      ))}
      <ExplainMath steps={plan.steps} assumptions={plan.assumptions} headingLevel={3} />
    </section>
  );
}
