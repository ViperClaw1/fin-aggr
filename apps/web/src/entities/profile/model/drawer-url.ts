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

const field = parseAsStringLiteral(PROFILE_FORM_FIELDS);

// Whether this page pushed the open entry. One per tab, like the history it describes.
let pushed = false;

/**
 * The field the drawer is open on (null when closed), `open` and `close`. Opening pushes a
 * history entry; closing steps back over it, so Back after closing leaves the page. A drawer that
 * arrived open (a link, a reload) has no entry of ours to step back over: closing replaces.
 * The component using it sits inside <Suspense> (.claude/rules/web.md).
 */
export function useProfileDrawer() {
  const [current, setField] = useQueryState(PROFILE_DRAWER_KEY, field);
  const open = (to: ProfileFormField) => {
    if (current === null) pushed = true;
    void setField(to, { history: current === null ? 'push' : 'replace' });
  };
  const close = () => {
    // already closed by Back: the browser has stepped over our entry itself
    if (current === null) {
      pushed = false;
      return;
    }
    if (pushed) {
      pushed = false;
      window.history.back();
    } else void setField(null, { history: 'replace' });
  };
  return { field: current, open, close };
}
