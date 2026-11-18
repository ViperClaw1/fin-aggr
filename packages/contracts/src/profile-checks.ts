// Zod-free Profile check (ADR-016 D3, D5). The bounds and value lists are shared with the schema
// in profile.ts, and a test keeps both in agreement.
import { isCents, isRate } from './money/checks';
import type { Profile, ProfileDraft } from './profile';
import {
  AGE_RANGE,
  FILING_STATUSES,
  HOLDING_MONTHS_RANGE,
  RESIDENCIES,
  STATE_CODE_LENGTH,
  ZIP_PATTERN,
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

const isZip: Check = (v) => typeof v === 'string' && ZIP_PATTERN.test(v);

/** A strict object: these keys (the `optional` ones may be absent), each present one passing its check. */
const strictObject = (fields: Record<string, Check>, optional: readonly string[] = []): Check => {
  const required = Object.keys(fields).filter((k) => !optional.includes(k));
  return (v) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
    const value = v as Record<string, unknown>;
    return (
      required.every((k) => k in value) &&
      Object.entries(value).every(([k, item]) => fields[k]?.(item) === true)
    );
  };
};

const PROFILE = strictObject(
  {
    version: (v) => v === 1,
    taxYear: Number.isSafeInteger,
    filingStatus: oneOf(FILING_STATUSES),
    stateCode: (v) => typeof v === 'string' && v.length === STATE_CODE_LENGTH,
    zip: isZip,
    taxableIncome: isCents,
    cityMarginalRate: nullable(isRate),
    residency: oneOf(RESIDENCIES),
    age: nullable(inRange(AGE_RANGE)),
    scenario: strictObject({ principal: isCents, holdingMonths: inRange(HOLDING_MONTHS_RANGE) }),
  },
  ['zip'],
);

export const isProfile = (x: unknown): x is Profile => PROFILE(x);

/** A partial object: only these keys, each present value passing its check. */
const partialObject = (fields: Record<string, Check>): Check => {
  const allowed = new Set(Object.keys(fields));
  return (v) =>
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.entries(v as Record<string, unknown>).every(
      ([k, value]) => allowed.has(k) && fields[k]?.(value) === true,
    );
};

// ProfileDraft: every Profile field but version is optional, and scenario's fields are too.
const DRAFT = partialObject({
  taxYear: Number.isSafeInteger,
  filingStatus: oneOf(FILING_STATUSES),
  stateCode: (v) => typeof v === 'string' && v.length === STATE_CODE_LENGTH,
  zip: isZip,
  taxableIncome: isCents,
  cityMarginalRate: nullable(isRate),
  residency: oneOf(RESIDENCIES),
  age: nullable(inRange(AGE_RANGE)),
  scenario: partialObject({
    principal: isCents,
    holdingMonths: inRange(HOLDING_MONTHS_RANGE),
  }),
});

export const isProfileDraft = (x: unknown): x is ProfileDraft => DRAFT(x);
