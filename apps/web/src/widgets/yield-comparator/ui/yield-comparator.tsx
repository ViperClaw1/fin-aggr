'use client';

// Best after-tax product in each stage-1 category. The scenario is the profile's, edited from an
// assumption (no separate form). Without a profile the page only asks for one.
import { formatUsd, type Assumption, type Product } from '@fa/contracts';
import type { NetYieldResult, RankedProduct } from '@fa/engine';
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  defaultAssumptions,
  PROFILE_FORM_FIELDS,
  useCompleteProfile,
  useProfileDraft,
  useProfileDrawer,
} from '@/entities/profile';
import { useNetYield } from '@/features/compute-net-yield';
import { assumptionField, useEditAssumptions } from '@/features/edit-assumptions';
import { ExplainMath } from '@/shared/ui/explain-math';
import { MetricCard } from '@/shared/ui/metric-card';
import { RateValue } from '@/shared/ui/rate-value';
import type { YieldData } from '../api/load';

const CARDS = [
  { id: 'cd', title: 'Best CD' },
  { id: 'savings', title: 'Best savings' },
  { id: 'treasury', title: 'Best Treasury' },
] as const;

interface Handlers {
  onEdit: (id: string) => void;
  onOpenProfile: () => void;
}

export function YieldComparator({ products, taxTables }: YieldData) {
  const [handlers, setHandlers] = useState<Handlers | null>(null);
  return (
    <>
      <Suspense fallback={null}>
        <UrlSync onChange={setHandlers} />
      </Suspense>
      <View products={products} taxTables={taxTables} handlers={handlers} />
    </>
  );
}

function UrlSync({ onChange }: { onChange: (handlers: Handlers) => void }) {
  const edit = useEditAssumptions();
  const { open } = useProfileDrawer();
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
      onOpenProfile: () => {
        openRef.current(PROFILE_FORM_FIELDS[0]);
      },
    });
  }, [onChange]);
  return null;
}

function offerKnownEdits(assumptions: readonly Assumption[]): Assumption[] {
  return assumptions.map((assumption) =>
    assumption.editable && assumptionField(assumption.id) === null
      ? { ...assumption, editable: false }
      : assumption,
  );
}

function bestOf(
  ranked: readonly RankedProduct[] | null,
  products: readonly Product[],
): { product: Product; net: NetYieldResult } | null {
  const top = ranked?.find((row) => row.group === 'eligible' && row.netYield !== null);
  if (top === undefined || top.netYield === null) return null;
  const product = products.find((item) => item.id === top.productId);
  if (product === undefined) return null;
  return { product, net: top.netYield };
}

function View({ products, taxTables, handlers }: YieldData & { handlers: Handlers | null }) {
  const draft = useProfileDraft();
  const profile = useCompleteProfile(taxTables.taxYear);
  const cd = useNetYield(products.cd, profile, taxTables);
  const savings = useNetYield(products.savings, profile, taxTables);
  const treasury = useNetYield(products.treasury, profile, taxTables);
  const ranked = { cd, savings, treasury };
  if (profile === null) {
    return (
      <div className="max-w-xl space-y-3">
        <p>Add your profile to compare a CD, a savings account and a Treasury after tax.</p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={handlers === null}
          onClick={() => {
            handlers?.onOpenProfile();
          }}
        >
          Add your profile
        </button>
      </div>
    );
  }
  const assumptions = offerKnownEdits(defaultAssumptions(draft, taxTables.taxYear));
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {CARDS.map((card) => {
        const best = bestOf(ranked[card.id], products[card.id]);
        return (
          <section key={card.id} aria-labelledby={card.id} className="space-y-3">
            <h2 id={card.id} className="text-lg font-semibold">
              {card.title}
            </h2>
            {best === null ? (
              <p className="text-sm text-muted">
                {ranked[card.id] === null ? 'Calculating…' : 'No eligible product.'}
              </p>
            ) : (
              <>
                <p className="font-medium">{best.product.name}</p>
                <MetricCard
                  label="Net interest"
                  value={<span data-assumption>{formatUsd(best.net.netInterest)}</span>}
                />
                <MetricCard
                  label="Net yield"
                  value={
                    <span data-assumption>
                      <RateValue rate={best.net.netSimpleAnnualYield} />
                    </span>
                  }
                />
                <ExplainMath
                  steps={best.net.steps}
                  assumptions={offerKnownEdits([...best.net.assumptions, ...assumptions])}
                  headingLevel={3}
                  {...(handlers === null ? {} : { onEditAssumption: handlers.onEdit })}
                />
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
