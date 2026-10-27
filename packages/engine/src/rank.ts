// Ranking (spec §5). The signature takes no ad data: sponsored slots cannot affect order (ADR-006).
import type { Id, Product, Profile, TaxTables } from '@fa/contracts';
import {
  evaluateEligibility,
  productEligibilityRule,
  toEligibilityContext,
  type EligibilityResult,
} from './rules';
import { computeNetYield, type NetYieldResult } from './yield';

export interface RankedProduct {
  productId: Id;
  group: EligibilityResult['status'];
  /** 1-based, only in the eligible group */
  rank: number | null;
  eligibility: EligibilityResult;
  /** null for ineligible products */
  netYield: NetYieldResult | null;
}

const GROUP_ORDER: Record<RankedProduct['group'], number> = {
  eligible: 0,
  needs_profile: 1,
  ineligible: 2,
};

function byGroupThenNetThenId(a: RankedProduct, b: RankedProduct): number {
  const group = GROUP_ORDER[a.group] - GROUP_ORDER[b.group];
  if (group !== 0) return group;
  const aNet = a.netYield?.netInterest ?? 0;
  const bNet = b.netYield?.netInterest ?? 0;
  if (aNet !== bNet) return bNet > aNet ? 1 : -1;
  // code-unit order, not localeCompare: the same on every machine
  if (a.productId === b.productId) return 0;
  return a.productId < b.productId ? -1 : 1;
}

export function rankProducts(
  products: readonly Product[],
  profile: Profile,
  tables: TaxTables,
): RankedProduct[] {
  const ctx = toEligibilityContext(profile);
  const { principal, holdingMonths } = profile.scenario;
  const unranked = products.map((product): RankedProduct => {
    const eligibility = evaluateEligibility(productEligibilityRule(product), ctx);
    const netYield =
      eligibility.status === 'ineligible'
        ? null
        : computeNetYield({
            product: { ...product, earlyWithdrawal: product.earlyWithdrawal.value },
            principal,
            holdingMonths,
            profile,
            tables,
          });
    return { productId: product.id, group: eligibility.status, rank: null, eligibility, netYield };
  });
  // eligible sorts first, so its position is its rank
  return unranked
    .sort(byGroupThenNetThenId)
    .map((r, i) => (r.group === 'eligible' ? { ...r, rank: i + 1 } : r));
}
