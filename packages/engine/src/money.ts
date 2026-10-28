// Decimal arithmetic on Cents and Rate (ADR-003, ADR-013). Values enter Decimal as safe integers
// or strings and leave through @fa/contracts as integer or decimal strings; never through float.
import { Decimal } from 'decimal.js';
import {
  asSignedRate,
  centsFromInteger,
  isRate,
  type Cents,
  type Rate,
  type SignedRate,
} from '@fa/contracts';
import { EngineError } from './errors';

/** Isolated clone: the global Decimal config is never touched. No exponent form in toString. */
export const D = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpPos: 9e15,
  toExpNeg: -9e15,
});

const MAX_CENTS = new D(Number.MAX_SAFE_INTEGER);
const RATE_DECIMALS = 8;

export function decCents(value: Cents): Decimal {
  if (!Number.isSafeInteger(value)) throw new EngineError('invalid_input', `not cents: ${value}`);
  return new D(value);
}

export function decRate(value: Rate): Decimal {
  // a typed Rate can still be wrong at runtime (unchecked input), hence the widened string
  if (!isRate(value)) throw new EngineError('invalid_rate', `not a rate: ${value as string}`);
  return new D(value);
}

/** Half-up to whole cents, once, at the output boundary. */
export function toCents(value: Decimal): Cents {
  const rounded = value.toDecimalPlaces(0, D.ROUND_HALF_UP);
  if (!rounded.isFinite() || rounded.abs().gt(MAX_CENTS))
    throw new EngineError(
      'invalid_input',
      `result outside the safe cents range: ${value.toString()}`,
    );
  return centsFromInteger(rounded.toString());
}

/** Half-up to 8 decimals, trailing zeros dropped, never "-0" (E2 decision 3). */
export function toSignedRate(value: Decimal): SignedRate {
  if (!value.isFinite()) throw new EngineError('invalid_input', 'rate is not finite');
  const rounded = value.toDecimalPlaces(RATE_DECIMALS, D.ROUND_HALF_UP);
  return asSignedRate(rounded.isZero() ? '0' : rounded.toString());
}

export function sumCents(values: readonly Cents[]): Cents {
  return toCents(values.reduce((acc, v) => acc.plus(decCents(v)), new D(0)));
}

/** amount × rate, half-up to the cent. */
export function mulRate(amount: Cents, rate: Rate): Cents {
  return toCents(decCents(amount).times(decRate(rate)));
}
