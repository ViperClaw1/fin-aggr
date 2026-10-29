'use client';

// Store states the user has to know about: a profile that failed to load, could not be kept, or
// was discarded on load. Shown in words, never by colour alone.
import { useProfileActions, useProfileStatus } from '@/entities/profile';

const RESET_TEXT = {
  corrupt: 'Your saved profile could not be read and was cleared.',
  invalid_shape: 'Your saved profile could not be read and was cleared.',
  future_version: 'Your saved profile was made by a newer version of this site and was cleared.',
} as const;

export function ProfileNotices() {
  const { loadError, persistError, resetReason } = useProfileStatus();
  const { acknowledgeReset } = useProfileActions();
  return (
    <>
      {loadError ? (
        <div role="alert" className="rounded-sm border border-danger bg-danger-bg p-3 text-danger">
          <p className="font-medium">Could not load your profile</p>
          <p className="mt-1">Your saved profile is kept. Reload the page to try again.</p>
        </div>
      ) : null}
      {persistError ? (
        <p role="status" className="rounded-sm border border-border p-3">
          This browser does not let the site save your profile. It is kept until you close this tab.
        </p>
      ) : null}
      {resetReason === null ? null : (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-sm border border-border p-3"
        >
          <p>{RESET_TEXT[resetReason]}</p>
          <button type="button" onClick={acknowledgeReset} className="btn btn-sm">
            OK
          </button>
        </div>
      )}
    </>
  );
}
