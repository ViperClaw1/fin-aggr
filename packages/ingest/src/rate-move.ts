import { isRate, type Rate } from '@fa/contracts';
import { Decimal } from 'decimal.js';
import { PRODUCT_BOUNDS } from './policy';

/** True when |next − previous| is greater than 50 basis points. Equal to the limit stays. */
export function rateMoveExceeds(next: string, previous: string): boolean {
  if (!isRate(next) || !isRate(previous)) return true;
  const delta = new Decimal(next).minus(previous).abs();
  return delta.gt(PRODUCT_BOUNDS.maxRateMove);
}

export function apyOutOfBounds(apy: Rate): boolean {
  const value = new Decimal(apy);
  return value.lt(PRODUCT_BOUNDS.apyMin) || value.gt(PRODUCT_BOUNDS.apyMax);
}
