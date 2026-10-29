'use client';

// The profile panel in the header: a button with the profile summary and a native modal <dialog>.
// It opens on ?profile=<field> (the button, or any widget through useProfileDrawer) with that
// field focused; Escape or Close clears the key, and the dialog returns focus where it was.
// The form loads on the first opening only, so its fields stay out of the first load.
import dynamic from 'next/dynamic';
import { useEffect, useId, useRef } from 'react';
import {
  PROFILE_FORM_FIELDS,
  useProfileDraft,
  useProfileDrawer,
  useProfileHydrated,
} from '@/entities/profile';
import { Skeleton } from '@/shared/ui/states';
import { profileSummary } from '../model/summary';

const ProfileForm = dynamic(() => import('@/features/edit-profile').then((m) => m.ProfileForm), {
  ssr: false,
  loading: () => <Skeleton label="Loading the profile form" className="h-64 w-full" />,
});

const BUTTON = 'rounded border border-border px-3 py-1.5';

export function ProfileDrawerFallback() {
  return (
    <button type="button" disabled className={BUTTON}>
      Profile
    </button>
  );
}

export function ProfileDrawer() {
  const [field, setField] = useProfileDrawer();
  const draft = useProfileDraft();
  const hydrated = useProfileHydrated();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (field !== null && !dialog.open) dialog.showModal();
    if (field === null && dialog.open) dialog.close();
  }, [field]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        className={BUTTON}
        onClick={() => {
          void setField(PROFILE_FORM_FIELDS[0]);
        }}
      >
        {hydrated ? profileSummary(draft) : 'Profile'}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => {
          // replace: closing does not add a history entry to step back into
          void setField(null, { history: 'replace' });
        }}
        className="ml-auto mr-0 h-dvh max-h-none w-full max-w-md bg-background p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 id={titleId} className="text-xl font-semibold">
              Your profile
            </h2>
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                dialogRef.current?.close();
              }}
            >
              Close
            </button>
          </div>
          <p className="text-sm text-muted">
            Your profile stays in this browser. It is never sent to our servers.
          </p>
          {field === null ? null : <ProfileForm focusField={field} />}
        </div>
      </dialog>
    </>
  );
}
