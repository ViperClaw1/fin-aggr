// Rate comparison on strings (ADR-013): no float, no BigInt. A Rate is "0" or "1" before the point
// and at most 8 decimals, so padding the fraction to 8 digits makes string order equal number order.
import type { Rate } from './rate';

const fixed8 = (rate: Rate): string => {
  const [whole = '0', fraction = ''] = rate.split('.');
  return `${whole}.${fraction.padEnd(8, '0')}`;
};

/** -1, 0 or 1; "0.0400" and "0.04" are equal. */
export function compareRate(a: Rate, b: Rate): -1 | 0 | 1 {
  const x = fixed8(a);
  const y = fixed8(b);
  if (x === y) return 0;
  return x < y ? -1 : 1;
}
