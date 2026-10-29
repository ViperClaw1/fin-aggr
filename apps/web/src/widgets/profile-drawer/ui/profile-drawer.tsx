'use client';

// The profile panel in the header: a button with the profile summary and a native modal <dialog>.
// It opens on ?profile=<field> (the button, or any widget through useProfileDrawer) with that
// field focused; Escape or Close clears the key, and the dialog returns focus where it was.
// The form loads on the first opening only, so its fields stay out of the first load.
import dynamic from 'next/dynamic';
import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import {
  PROFILE_FORM_FIELDS,
  PROFILE_PRIVACY_TEXT,
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

const BUTTON = 'btn btn-sm max-w-[60vw] truncate';

export function ProfileDrawerFallback() {
  return (
    <button type="button" disabled className={BUTTON}>
      Profile
    </button>
  );
}

export function ProfileDrawer() {
  const { field, open, close } = useProfileDrawer();
  const draft = useProfileDraft();
  const hydrated = useProfileHydrated();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // layout effect: the dialog opens before the form's own effect focuses the field; with a passive
  // effect showModal() ran after it on a reopening (form chunk cached) and moved focus to Close
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (field !== null && !dialog.open) dialog.showModal();
    if (field === null && dialog.open) dialog.close();
  }, [field]);

  // a click on the backdrop lands on the <dialog> itself (the panel covers the rest): it closes,
  // like Escape. A native listener: jsx-a11y rejects click handlers on a dialog element.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return undefined;
    const onClick = (e: MouseEvent): void => {
      if (e.target === dialog) dialog.close();
    };
    dialog.addEventListener('click', onClick);
    return () => {
      dialog.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        className={BUTTON}
        onClick={() => {
          open(PROFILE_FORM_FIELDS[0]);
        }}
      >
        {hydrated ? profileSummary(draft) : 'Profile'}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={close}
        // a right-hand sheet the height of the screen; only its body scrolls, the title bar stays
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-md overflow-hidden border-l border-divider bg-background p-0 text-foreground backdrop:bg-black/60"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-divider px-4 py-3 sm:px-6">
            <h2 id={titleId} className="text-lg font-semibold">
              Your profile
            </h2>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                dialogRef.current?.close();
              }}
            >
              Close
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            <p className="text-sm text-muted">{PROFILE_PRIVACY_TEXT.staysLocal}</p>
            {field === null ? null : <ProfileForm focusField={field} />}
          </div>
        </div>
      </dialog>
    </>
  );
}
