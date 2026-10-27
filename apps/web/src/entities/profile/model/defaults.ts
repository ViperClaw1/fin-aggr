import { Cents } from '@fa/contracts';

// Stage 1: the year of the fixture tax tables, not the clock (getTaxTables(2027) would be
// not_found). Changes together with the tables; with a real gateway, take the latest year on offer.
export const DEFAULT_TAX_YEAR = 2026;

/** Shown as an editable assumption until the user sets the scenario, never as their data. */
export const DEFAULT_SCENARIO = { principal: Cents.parse(1000000), holdingMonths: 12 } as const;

/** Without these there is no after-tax ranking; residency is never guessed. */
export const REQUIRED_FIELDS = ['filingStatus', 'stateCode', 'taxableIncome', 'residency'] as const;
