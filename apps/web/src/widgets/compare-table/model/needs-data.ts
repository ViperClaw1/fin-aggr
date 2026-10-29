// Products the engine could not decide for lack of profile data ("needs_profile"), and which
// profile form fields would decide them. Rule fields are named differently from the form
// (stateOfResidence ← stateCode, depositAmount ← principal), so the mapping is explicit.
import type { ProfileField } from '@fa/contracts';
import type { RankedProduct } from '@fa/engine';
import type { ProfileFormField } from '@/entities/profile';

const FORM_FIELD: Record<ProfileField, ProfileFormField> = {
  residency: 'residency',
  stateOfResidence: 'stateCode',
  age: 'age',
  filingStatus: 'filingStatus',
  depositAmount: 'principal',
};

export interface NeedsData {
  count: number;
  /** rule fields in a fixed order, each with the form field that answers it */
  fields: { rule: ProfileField; form: ProfileFormField }[];
}

export function needsData(ranked: readonly RankedProduct[] | null): NeedsData | null {
  if (ranked === null) return null;
  const waiting = ranked.filter((r) => r.group === 'needs_profile');
  if (waiting.length === 0) return null;
  const missing = new Set(waiting.flatMap((r) => r.eligibility.missingFields));
  const fields = (Object.keys(FORM_FIELD) as ProfileField[])
    .filter((f) => missing.has(f))
    .map((rule) => ({ rule, form: FORM_FIELD[rule] }));
  return { count: waiting.length, fields };
}
