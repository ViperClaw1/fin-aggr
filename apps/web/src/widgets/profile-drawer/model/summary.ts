import { formatUsd, type ProfileDraft } from '@fa/contracts';

/** The header button's text: what the profile holds, shown only in this browser. */
export function profileSummary(draft: ProfileDraft): string {
  const parts = [
    draft.stateCode,
    draft.taxableIncome === undefined ? undefined : formatUsd(draft.taxableIncome),
  ].filter((p) => p !== undefined);
  return parts.length === 0 ? 'Add your profile' : `Profile: ${parts.join(', ')}`;
}
