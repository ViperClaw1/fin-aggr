// Gross interest, term cap and early withdrawal penalty (spec §5 rules 2–4, E2 decision 2).
import type { Decimal } from 'decimal.js';
import type { Cents, EarlyWithdrawal, Product, ProductCategory, RateTier } from '@fa/contracts';
import { EngineError } from './errors';
import { D, decCents, decRate } from './money';
import { tierPortions, type TierPortion } from './tiers';

export interface YieldProduct {
  category: ProductCategory;
  termMonths: number | null;
  tierMode: 'whole_balance' | 'marginal';
  tiers: readonly RateTier[];
  earlyWithdrawal: EarlyWithdrawal;
  taxTreatment: Product['taxTreatment'];
}

export interface Interest {
  portions: readonly TierPortion[];
  /** months that earn interest: holdingMonths capped at termMonths */
  months: number;
  gross: Decimal;
  penalty: Decimal;
  closedEarly: boolean;
  cappedAtTerm: boolean;
}

export const DAYS_PER_YEAR = 365;

/** Σ amount × ((1 + apy)^years − 1): APY is already effective, compounding does not change it. */
function interestFor(portions: readonly TierPortion[], years: Decimal): Decimal {
  return portions.reduce(
    (sum, { apy, amount }) => sum.plus(amount.times(decRate(apy).plus(1).pow(years).minus(1))),
    new D(0),
  );
}

function penaltyFor(
  rule: EarlyWithdrawal,
  portions: readonly TierPortion[],
  principal: Cents,
): Decimal {
  switch (rule.kind) {
    case 'none':
      return new D(0);
    case 'days_of_interest':
      // simple, not compounded: amount × apy × days / 365 (issuer terms: "days of simple interest")
      return portions.reduce(
        (sum, { apy, amount }) =>
          sum.plus(amount.times(decRate(apy)).times(rule.days).div(DAYS_PER_YEAR)),
        new D(0),
      );
    case 'months_of_interest':
      return interestFor(portions, new D(rule.months).div(12));
    case 'percent_of_principal':
      return decCents(principal).times(decRate(rule.rate));
  }
}

export function computeInterest(
  product: YieldProduct,
  principal: Cents,
  holdingMonths: number,
): Interest {
  if (!Number.isSafeInteger(holdingMonths) || holdingMonths < 1)
    throw new EngineError('invalid_input', `holdingMonths must be a positive integer`);
  const { termMonths } = product;
  const portions = tierPortions(product.tierMode, product.tiers, principal);
  const months = termMonths === null ? holdingMonths : Math.min(holdingMonths, termMonths);
  const closedEarly = termMonths !== null && holdingMonths < termMonths;
  return {
    portions,
    months,
    gross: interestFor(portions, new D(months).div(12)),
    // not capped at the accrued interest (spec §5 rule 4)
    penalty: closedEarly ? penaltyFor(product.earlyWithdrawal, portions, principal) : new D(0),
    closedEarly,
    cappedAtTerm: termMonths !== null && holdingMonths > termMonths,
  };
}
