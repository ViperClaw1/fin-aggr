// URL state of the profile drawer, ?profile=<field> (E5 decision 2). The value is a field name,
// never a field value (ADR-004). It lives in the entity so any widget or feature can open the
// drawer on a field without importing the drawer itself.
import type { Profile, ProfileDraft } from '@fa/contracts';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

/** The form's fields in display order; the scenario fields are named without the prefix. */
export const PROFILE_FORM_FIELDS = [
  'filingStatus',
  'stateCode',
  'taxableIncome',
  'cityMarginalRate',
  'residency',
  'age',
  'principal',
  'holdingMonths',
] as const satisfies readonly (keyof ProfileDraft | keyof Profile['scenario'])[];
export type ProfileFormField = (typeof PROFILE_FORM_FIELDS)[number];

export const PROFILE_DRAWER_KEY = 'profile';

// Opening pushes a history entry, so Back closes the drawer.
const field = parseAsStringLiteral(PROFILE_FORM_FIELDS).withOptions({ history: 'push' });

/**
 * The field the drawer is open on, or null when closed. The component using it sits inside
 * <Suspense> (.claude/rules/web.md).
 */
export const useProfileDrawer = () => useQueryState(PROFILE_DRAWER_KEY, field);
