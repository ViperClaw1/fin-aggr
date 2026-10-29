import { centsFromSafeInteger } from '@fa/contracts';

/** Shown as an editable assumption until the user sets the scenario, never as their data. */
export const DEFAULT_SCENARIO = {
  principal: centsFromSafeInteger(1000000),
  holdingMonths: 12,
} as const;

/** Without these there is no after-tax ranking; residency is never guessed. */
export const REQUIRED_FIELDS = ['filingStatus', 'stateCode', 'taxableIncome', 'residency'] as const;
