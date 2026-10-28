// Words for enum codes, shared by the engine (step texts) and the UI (eligibility reasons),
// so a code never reaches the screen and there is one copy of each label.
// Labels are UI words: additive, no logic (ADR-013 consequences).
import type { FilingStatus } from './reference';
import type { Profile } from './profile';
import type { ProfileField } from './rules';

export const FILING_STATUS_LABEL: Record<FilingStatus, string> = {
  single: 'Single',
  married_joint: 'Married filing jointly',
  married_separate: 'Married filing separately',
  head_of_household: 'Head of household',
};

export const RESIDENCY_LABEL: Record<Profile['residency'], string> = {
  us_citizen: 'US citizen',
  us_resident: 'US resident',
  nonresident: 'Nonresident',
};

export const PROFILE_FIELD_LABEL: Record<ProfileField, string> = {
  residency: 'residency status',
  stateOfResidence: 'state of residence',
  age: 'age',
  filingStatus: 'filing status',
  depositAmount: 'deposit amount',
};
