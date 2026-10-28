// The only place in shared/ui where money and rates become numbers (ADR-013, E4 amendment).
// The result is an SVG coordinate in percent and never turns back into money: every label on a
// chart is formatted from the original Cents or Rate.
import type { Cents, Rate } from '@fa/contracts';

/** Display geometry only: a Rate has at most 8 decimals, so float error is far below a pixel. */
const toNumber = (v: Cents | Rate): number => (typeof v === 'number' ? v : Number(v));

/** Position of `value` on a 0…max axis, in percent, clamped to 0–100. */
export function position(value: Cents | Rate, max: Cents | Rate): number {
  const m = toNumber(max);
  if (!(m > 0)) throw new Error(`chart scale max must be > 0, got ${String(max)}`);
  return Math.min(100, Math.max(0, (toNumber(value) / m) * 100));
}

/** True when the value lies past the end of the axis. */
export const isOver = (value: Cents | Rate, max: Cents | Rate): boolean =>
  toNumber(value) > toNumber(max);
