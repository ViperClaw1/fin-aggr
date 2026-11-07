import { describe, expect, it } from 'vitest';
import {
  daysToUnit,
  monthsInWindow,
  termFilterForWindow,
  unitToDays,
  windowFromFilter,
} from './term-window';

const CATALOG = [3, 6, 9, 12, 18, 24, 36, 60];

describe('term window', () => {
  it('maps a month step onto 30 days', () => {
    expect(unitToDays(12, 'months')).toBe(360);
    expect(daysToUnit(360, 'months')).toBe(12);
    expect(daysToUnit(360, 'weeks')).toBe(51);
  });

  it('selects the catalog months inside 6–24 months and clears a full span', () => {
    expect(monthsInWindow(CATALOG, 180, 720)).toEqual([6, 9, 12, 18, 24]);
    expect(termFilterForWindow(CATALOG, 180, 720)).toEqual([6, 9, 12, 18, 24]);
    expect(termFilterForWindow(CATALOG, 1, 1800)).toEqual([]);
  });

  it('reads a single URL term back as that month', () => {
    expect(windowFromFilter(CATALOG, [12])).toEqual({ minDay: 360, maxDay: 360 });
  });
});
