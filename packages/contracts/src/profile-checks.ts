// Zod-free Profile check (ADR-016 D3, D5). The bounds and value lists are shared with the schema
// in profile.ts, and a test keeps both in agreement.
import { isCents, isRate } from './money/checks';
import type { Profile } from './profile';
import {
  AGE_RANGE,
  FILING_STATUSES,
  HOLDING_MONTHS_RANGE,
  RESIDENCIES,
  STATE_CODE_LENGTH,
} from './profile-rules';

type Check = (v: unknown) => boolean;

const inRange =
  ([min, max]: readonly [number, number]): Check =>
  (v) =>
    Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const oneOf =
  (list: readonly string[]): Check =>
  (v) =>
    typeof v === 'string' && list.includes(v);
const nullable =
  (check: Check): Check =>
  (v) =>
    v === null || check(v);

/** A strict object: exactly these keys, each passing its check. */
const strictObject = (fields: Record<string, Check>): Check => {
  const keys = Object.keys(fields).sort().join(',');
  return (v) =>
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.keys(v).sort().join(',') === keys &&
    Object.entries(fields).every(([k, check]) => check((v as Record<string, unknown>)[k]));
};

const PROFILE = strictObject({
  version: (v) => v === 1,
  taxYear: Number.isSafeInteger,
  filingStatus: oneOf(FILING_STATUSES),
  stateCode: (v) => typeof v === 'string' && v.length === STATE_CODE_LENGTH,
  taxableIncome: isCents,
  cityMarginalRate: nullable(isRate),
  residency: oneOf(RESIDENCIES),
  age: nullable(inRange(AGE_RANGE)),
  scenario: strictObject({ principal: isCents, holdingMonths: inRange(HOLDING_MONTHS_RANGE) }),
});

export const isProfile = (x: unknown): x is Profile => PROFILE(x);
