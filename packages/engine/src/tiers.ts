// Tier selection (spec §5 rule 1, E2 decision 1). Tiers are sorted and non-overlapping (schema).
import type { Decimal } from 'decimal.js';
import type { Cents, Rate, RateTier } from '@fa/contracts';
import { EngineError } from './errors';
import { D, decCents } from './money';

export interface TierPortion {
  apy: Rate;
  amount: Decimal;
}

/** whole_balance: the one tier with min ≤ P ≤ max takes the whole principal. */
function wholeBalance(tiers: readonly RateTier[], principal: Cents): TierPortion[] {
  const tier = tiers.find(
    (t) => t.minBalance <= principal && (t.maxBalance === null || principal <= t.maxBalance),
  );
  if (tier === undefined) throw new EngineError('no_tier', `no tier holds ${String(principal)}`);
  return [{ apy: tier.apy, amount: decCents(principal) }];
}

/**
 * marginal: tier i earns on clamp(P, min_i, min_{i+1}) − min_i; the last tier takes the rest.
 * maxBalance is not used here, so adjacent tiers (max 9999.99, next min 10000.00) leave no gap.
 */
function marginal(tiers: readonly RateTier[], principal: Cents): TierPortion[] {
  const first = tiers[0];
  if (first === undefined || principal < first.minBalance)
    throw new EngineError('no_tier', `no tier holds ${String(principal)}`);
  const p = decCents(principal);
  return tiers
    .map((tier, i) => {
      const lo = decCents(tier.minBalance);
      const next = tiers[i + 1];
      const hi = next === undefined ? p : D.min(p, decCents(next.minBalance));
      return { apy: tier.apy, amount: D.max(lo, hi).minus(lo) };
    })
    .filter((portion) => portion.amount.gt(0));
}

export function tierPortions(
  mode: 'whole_balance' | 'marginal',
  tiers: readonly RateTier[],
  principal: Cents,
): TierPortion[] {
  return mode === 'whole_balance' ? wholeBalance(tiers, principal) : marginal(tiers, principal);
}
