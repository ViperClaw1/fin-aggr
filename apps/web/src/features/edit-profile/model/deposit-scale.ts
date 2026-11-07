// Slider geometry for the deposit (ADR-013: the position is not money). The value that is stored
// is whole cents, snapped to $500 between $500 and $250,000.
import { centsFromSafeInteger, type Cents } from '@fa/contracts';

const MIN_DOLLARS = 500;
const MAX_DOLLARS = 250_000;
const STEP_DOLLARS = 500;
const SLIDER_END = 1000;

export const DEPOSIT_MIN = centsFromSafeInteger(MIN_DOLLARS * 100);
export const DEPOSIT_MAX = centsFromSafeInteger(MAX_DOLLARS * 100);

function clampDollars(dollars: number): number {
  return Math.min(MAX_DOLLARS, Math.max(MIN_DOLLARS, dollars));
}

function snapDollars(dollars: number): number {
  return clampDollars(Math.round(clampDollars(dollars) / STEP_DOLLARS) * STEP_DOLLARS);
}

/** Logarithmic slider position 0…1000 → cents on the $500 grid. */
export function centsFromDepositSlider(position: number): Cents {
  const t = Math.min(SLIDER_END, Math.max(0, position)) / SLIDER_END;
  const dollars = Math.exp(
    Math.log(MIN_DOLLARS) + t * (Math.log(MAX_DOLLARS) - Math.log(MIN_DOLLARS)),
  );
  return centsFromSafeInteger(snapDollars(dollars) * 100);
}

/** Inverse of `centsFromDepositSlider` for placing the thumb on a stored deposit. */
export function depositSliderFromCents(cents: number): number {
  const dollars = clampDollars(cents / 100);
  const t =
    (Math.log(dollars) - Math.log(MIN_DOLLARS)) / (Math.log(MAX_DOLLARS) - Math.log(MIN_DOLLARS));
  return Math.round(Math.min(1, Math.max(0, t)) * SLIDER_END);
}

/** A typed amount, snapped onto the same grid. */
export function clampDepositCents(cents: number): Cents {
  return centsFromSafeInteger(snapDollars(cents / 100) * 100);
}
