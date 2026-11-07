// Term filter as a day window. Products store whole months; days and weeks are a view of that
// window (30-day months, 7-day weeks). The URL still stores the catalog months inside the window.

const TERM_MAX_MONTHS = 60;
export const DAYS_PER_MONTH = 30;
const DAYS_PER_WEEK = 7;
export const TERM_MIN_DAYS = 1;
export const TERM_MAX_DAYS = TERM_MAX_MONTHS * DAYS_PER_MONTH;

export type TermUnit = 'days' | 'weeks' | 'months';

const UNIT_DAYS: Record<TermUnit, number> = {
  days: 1,
  weeks: DAYS_PER_WEEK,
  months: DAYS_PER_MONTH,
};

export function daysToUnit(days: number, unit: TermUnit): number {
  const size = UNIT_DAYS[unit];
  return Math.max(1, Math.round(days / size));
}

export function unitToDays(value: number, unit: TermUnit): number {
  const days = value * UNIT_DAYS[unit];
  return Math.min(TERM_MAX_DAYS, Math.max(TERM_MIN_DAYS, days));
}

export function snapDays(days: number, unit: TermUnit): number {
  const size = UNIT_DAYS[unit];
  const snapped = Math.round(days / size) * size;
  return Math.min(TERM_MAX_DAYS, Math.max(size, snapped));
}

/** Catalog months whose 30-day mark falls inside the window, oldest first. */
export function monthsInWindow(
  catalog: readonly number[],
  minDay: number,
  maxDay: number,
): number[] {
  const lo = Math.min(minDay, maxDay);
  const hi = Math.max(minDay, maxDay);
  return catalog.filter((months) => {
    const day = months * DAYS_PER_MONTH;
    return day >= lo && day <= hi;
  });
}

/**
 * Months to write to the URL. An empty list means "no term filter": the window covers every
 * catalog term. At most ten months, the URL parser's cap, shortest first.
 */
export function termFilterForWindow(
  catalog: readonly number[],
  minDay: number,
  maxDay: number,
): number[] {
  const inside = monthsInWindow(catalog, minDay, maxDay);
  if (inside.length === catalog.length) return [];
  return inside.slice(0, 10);
}

/** Full span when nothing is selected, otherwise the selected months' day marks. */
export function windowFromFilter(
  catalog: readonly number[],
  selected: readonly number[],
): { minDay: number; maxDay: number } {
  if (selected.length === 0 || catalog.length === 0) {
    return { minDay: TERM_MIN_DAYS, maxDay: TERM_MAX_DAYS };
  }
  const days = selected.map((months) => months * DAYS_PER_MONTH);
  return { minDay: Math.min(...days), maxDay: Math.max(...days) };
}

export function unitWord(unit: TermUnit, count: number): string {
  const one = unitSingular(unit);
  return count === 1 ? one : `${one}s`;
}

function unitSingular(unit: TermUnit): string {
  if (unit === 'days') return 'day';
  if (unit === 'weeks') return 'week';
  return 'month';
}
