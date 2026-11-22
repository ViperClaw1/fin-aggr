import { parseRate, type Rate } from '@fa/contracts';
import { Decimal } from 'decimal.js';

/**
 * Treasury yields as APY, so they compare with CD APY (spec §5 rule 2, confirmed by the owner
 * 2026-11-22). Inputs are the official decimal strings; nothing passes through a float.
 */

const D = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpPos: 9e15,
  toExpNeg: -9e15,
});
const RATE_DECIMALS = 8;
const DAYS_PER_YEAR = 365;

/** Half-up to 8 decimals once, trailing zeros dropped. */
function toRate(value: Decimal): Rate {
  return parseRate(value.toDecimalPlaces(RATE_DECIMALS, D.ROUND_HALF_UP).toString());
}

function positive(text: string, label: string): Decimal {
  const value = new D(text);
  if (!value.isFinite() || value.lte(0)) throw new Error(`${label} must be positive: ${text}`);
  return value;
}

/** 12 CFR 1030 Appendix A: APY = (1 + Interest/Principal)^(365/Days in term) − 1. */
export function regDdApy(interest: string, principal: string, daysInTerm: number): Rate {
  if (!Number.isSafeInteger(daysInTerm) || daysInTerm <= 0) {
    throw new Error(`days in term must be a positive integer: ${String(daysInTerm)}`);
  }
  const ratio = new D(interest).div(positive(principal, 'principal'));
  if (ratio.lt(0)) throw new Error(`interest must not be negative: ${interest}`);
  return toRate(ratio.plus(1).pow(new D(DAYS_PER_YEAR).div(daysInTerm)).minus(1));
}

/** A bill bought at `price` per 100 and redeemed at 100: Interest = 100 − P, Principal = P. */
export function billApy(pricePer100: string, daysToMaturity: number): Rate {
  const price = positive(pricePer100, 'price');
  if (price.gt(100)) throw new Error(`bill price above par: ${pricePer100}`);
  return regDdApy(new D(100).minus(price).toString(), price.toString(), daysToMaturity);
}

/** 31 CFR 356 Appendix B: note yield is semiannual. APY = (1 + y/2)^2 − 1, coupons reinvested. */
export function noteApy(semiannualYieldPercent: string): Rate {
  const y = positive(semiannualYieldPercent, 'yield').div(100);
  return toRate(y.div(2).plus(1).pow(2).minus(1));
}
