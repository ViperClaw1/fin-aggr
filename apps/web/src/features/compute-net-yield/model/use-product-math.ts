'use client';

// One product's after-tax result (product page). useNetYield ranks a list and stays null until the
// profile is complete, so a page that must show default assumptions with no profile cannot use it.
// The engine loads once there is a browser: the prerender stays free of decimal.js (ADR-016).
import type { Product, Profile, ProfileDraft, TaxTables } from '@fa/contracts';
import type {
  EligibilityResult,
  NetYieldResult,
  computeNetYield,
  evaluateEligibility,
  productEligibilityRule,
  toEligibilityContext,
} from '@fa/engine';
import { useEffect, useMemo, useState } from 'react';
import { toEngineProfile } from '@/entities/profile';
import { lazyOnce } from '@/shared/lib/lazy-once';

interface Engine {
  computeNetYield: typeof computeNetYield;
  evaluateEligibility: typeof evaluateEligibility;
  productEligibilityRule: typeof productEligibilityRule;
  toEligibilityContext: typeof toEligibilityContext;
}

const loadEngine = lazyOnce((): Promise<Engine> => import('@fa/engine'));

export interface ProductMath {
  /** null until the engine has loaded */
  eligibility: EligibilityResult | null;
  /** null without a complete profile, while ineligible, or before the engine has loaded */
  net: NetYieldResult | null;
}

export function useProductMath(
  product: Product,
  draft: ProfileDraft,
  profile: Profile | null,
  tables: TaxTables,
): ProductMath {
  const [engine, setEngine] = useState<Engine | null>(null);
  useEffect(() => {
    if (engine !== null) return;
    loadEngine().then(
      (mod) => {
        setEngine(() => mod);
      },
      () => undefined,
    );
  }, [engine]);
  return useMemo(() => {
    if (engine === null) return { eligibility: null, net: null };
    const eligibility = engine.evaluateEligibility(
      engine.productEligibilityRule(product),
      engine.toEligibilityContext(toEngineProfile(draft)),
    );
    if (profile === null || eligibility.status === 'ineligible') return { eligibility, net: null };
    const net = engine.computeNetYield({
      product: { ...product, earlyWithdrawal: product.earlyWithdrawal.value },
      principal: profile.scenario.principal,
      holdingMonths: profile.scenario.holdingMonths,
      profile,
      tables,
    });
    return { eligibility, net };
  }, [engine, product, draft, profile, tables]);
}
