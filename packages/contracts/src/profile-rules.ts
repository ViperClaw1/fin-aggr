// Profile bounds and value lists, shared by the schema (profile.ts) and the zod-free check
// (profile-checks.ts). No imports, so neither side forms a cycle.
export const FILING_STATUSES = [
  'single',
  'married_joint',
  'married_separate',
  'head_of_household',
] as const;
export const RESIDENCIES = ['us_citizen', 'us_resident', 'nonresident'] as const;
export const AGE_RANGE = [0, 120] as const;
export const HOLDING_MONTHS_RANGE = [1, 120] as const;
export const STATE_CODE_LENGTH = 2;
