import { Decimal } from 'decimal.js';

const PLACES = 4;

/** Even count: the mean of the two middle values. Half-up, four decimal places. */
export function median(values: readonly Decimal[]): Decimal {
  const sorted = [...values].sort((left, right) => left.comparedTo(right));
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) throw new Error('fdic financials market is empty');
  if (sorted.length % 2 === 1) return upper.toDecimalPlaces(PLACES, Decimal.ROUND_HALF_UP);
  const lower = sorted[mid - 1];
  if (lower === undefined) throw new Error('fdic financials market is empty');
  return lower.plus(upper).div(2).toDecimalPlaces(PLACES, Decimal.ROUND_HALF_UP);
}

/** Sum divided by the count. Half-up, four decimal places. */
export function mean(values: readonly Decimal[]): Decimal {
  const total = values.reduce((sum, value) => sum.plus(value), new Decimal(0));
  return total.div(values.length).toDecimalPlaces(PLACES, Decimal.ROUND_HALF_UP);
}

/** Share of values at or below this one, as a whole number of percent. */
export function percentile(value: Decimal, values: readonly Decimal[]): number {
  const atOrBelow = values.filter((item) => item.lte(value)).length;
  return new Decimal(atOrBelow)
    .times(100)
    .div(values.length)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** The contract stores a display percent. This is the one conversion out of decimal.js. */
export function percentPoints(value: Decimal): number {
  return value.toDecimalPlaces(PLACES, Decimal.ROUND_HALF_UP).toNumber();
}
