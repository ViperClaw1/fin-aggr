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

/** Position of `value` on a min…max axis, in percent, clamped to 0–100. `min` may be negative. */
export function positionBetween(value: number, min: number, max: number): number {
  const span = max - min;
  if (!(span > 0))
    throw new Error(`chart scale span must be > 0, got ${String(min)}…${String(max)}`);
  return Math.min(100, Math.max(0, ((value - min) / span) * 100));
}

/**
 * Bar from zero (or the nearer edge, when zero is off the axis) to `value`.
 * Coordinates are SVG percents. Geometry only (ADR-013).
 */
function axisAnchor(min: number, max: number): number {
  if (min > 0) return min;
  if (max < 0) return max;
  return 0;
}

export function barSpan(value: number, min: number, max: number): { x: number; width: number } {
  const anchor = axisAnchor(min, max);
  const from = positionBetween(anchor, min, max);
  const to = positionBetween(value, min, max);
  return { x: Math.min(from, to), width: Math.abs(to - from) };
}

/**
 * An axis that includes every value and zero, with a little room at the outer edge.
 * Positive metrics stay on a 0…max axis. A negative value pulls `min` below zero.
 */
export function percentExtent(values: readonly number[]): { min: number; max: number } {
  const finite = values.filter((n) => Number.isFinite(n));
  if (finite.length === 0) return { min: 0, max: 1 };
  const floor = Math.min(0, ...finite);
  const ceil = Math.max(0, ...finite);
  if (floor === ceil) return { min: 0, max: 1 };
  const pad = (ceil - floor) * 0.05;
  return {
    min: floor < 0 ? floor - pad : 0,
    max: ceil > 0 ? ceil + pad : 0,
  };
}
