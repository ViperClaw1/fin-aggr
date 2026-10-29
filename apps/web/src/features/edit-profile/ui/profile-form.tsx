'use client';

// The profile form, the only writer of the profile store (ADR-004, ESLint PROFILE_WRITE). Until
// the store has hydrated it rejects edits (ADR-016 D5), so the fields are disabled and the form
// is busy; after a failed load they stay disabled, so nothing overwrites the stored profile.
import type { ProfileDraft } from '@fa/contracts';
import { useEffect, useRef, useState } from 'react';
import {
  useProfileActions,
  useProfileDraft,
  useProfileStatus,
  type ProfileFormField,
} from '@/entities/profile';
import { ProfileFields } from './profile-fields';
import { ProfileFile } from './profile-file';
import { ProfileNotices } from './profile-notices';

interface ProfileFormProps {
  /** Focused once the fields are enabled. */
  focusField: ProfileFormField | null;
}

export function ProfileForm({ focusField }: ProfileFormProps) {
  const draft = useProfileDraft();
  const { hydrated, loadError } = useProfileStatus();
  const { update } = useProfileActions();
  const [issues, setIssues] = useState<readonly string[]>([]);
  // fields are uncontrolled: a new revision remounts them with the stored values
  const [revision, setRevision] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const disabled = !hydrated || loadError;

  useEffect(() => {
    if (disabled || focusField === null) return;
    const el = formRef.current?.elements.namedItem(focusField);
    if (el instanceof HTMLElement) el.focus();
  }, [disabled, focusField]);

  const write = (patch: ProfileDraft) => {
    const result = update(patch);
    setIssues(result.ok ? [] : result.issues);
  };

  return (
    <div className="flex flex-col gap-6">
      <ProfileNotices />
      <form
        ref={formRef}
        aria-busy={!hydrated}
        aria-label="Profile"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <fieldset disabled={disabled} className="flex flex-col gap-4">
          <legend className="sr-only">Your profile</legend>
          {hydrated ? null : <p className="text-sm text-muted">Loading your profile…</p>}
          <div key={`${String(revision)}-${String(hydrated)}`} className="flex flex-col gap-4">
            <ProfileFields draft={draft} write={write} />
          </div>
          {issues.length === 0 ? null : (
            <div role="alert" className="text-sm text-danger">
              <p className="font-medium">This value was not saved:</p>
              <ul className="list-disc pl-5">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </fieldset>
      </form>
      <ProfileFile
        disabled={disabled}
        onReplaced={() => {
          setIssues([]);
          setRevision((r) => r + 1);
        }}
      />
    </div>
  );
}
