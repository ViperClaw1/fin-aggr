import type { ProfileDraft } from '@fa/contracts';
import { missingFields, REQUIRED_FIELDS } from '@/entities/profile';

/**
 * The header button's text. Visible on every page (screen sharing, screenshots), so it never shows
 * income or another sensitive value: the state and how much of the profile is filled in.
 */
export type ProfileFill = 'empty' | 'partial' | 'complete';

export function profileFill(draft: ProfileDraft): ProfileFill {
  const missing = missingFields(draft).length;
  if (missing === REQUIRED_FIELDS.length) return 'empty';
  if (missing === 0) return 'complete';
  return 'partial';
}

export function profileSummary(draft: ProfileDraft): string {
  const missing = missingFields(draft).length;
  const total = REQUIRED_FIELDS.length;
  if (missing === total) return 'No profile yet';
  if (missing === 0) return `Profile: ${draft.stateCode ?? ''} · complete`;
  return `Profile: ${String(total - missing)} of ${String(total)} filled`;
}
