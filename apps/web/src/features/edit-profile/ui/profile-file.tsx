'use client';

// Export to a file, import from one, erase everything. The file is made and read in the browser;
// nothing is uploaded (ADR-004).
import { useId, useState } from 'react';
import { exportProfile, useProfileActions, useProfileDraft } from '@/entities/profile';
import { IMPORT_ERROR_MESSAGES, importFile } from '../model/import-file';
import { BUTTON, EraseProfile } from './erase-profile';

interface ProfileFileProps {
  disabled: boolean;
  /** Called after the stored profile was replaced or erased, so the form shows the new values. */
  onReplaced: () => void;
}

function download(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fa-profile.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function ProfileFile({ disabled, onReplaced }: ProfileFileProps) {
  const draft = useProfileDraft();
  const { replace } = useProfileActions();
  const id = useId();
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const onFile = async (file: File) => {
    const result = await importFile(file);
    const replaced = result.ok ? replace(result.draft).ok : false;
    setMessage(
      replaced
        ? { error: false, text: 'Profile imported.' }
        : {
            error: true,
            text: `Import failed: ${IMPORT_ERROR_MESSAGES[result.ok ? 'invalid_profile' : result.error]}`,
          },
    );
    if (replaced) onReplaced();
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h3 id={`${id}-heading`} className="font-medium">
        Your profile file
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          className={BUTTON}
          onClick={() => {
            download(exportProfile(draft));
          }}
        >
          Export profile
        </button>
        <label htmlFor={`${id}-import`} className="sr-only">
          Import profile
        </label>
        <input
          id={`${id}-import`}
          type="file"
          accept="application/json,.json"
          disabled={disabled}
          className="text-sm"
          onChange={(e) => {
            const input = e.currentTarget;
            const file = input.files?.[0];
            input.value = '';
            if (file !== undefined) void onFile(file);
          }}
        />
      </div>
      <div aria-live="polite">
        {message === null ? null : (
          <p className={message.error ? 'text-sm text-danger' : 'text-sm'}>{message.text}</p>
        )}
      </div>
      <EraseProfile
        disabled={disabled}
        onErased={() => {
          setMessage({ error: false, text: 'Profile erased.' });
          onReplaced();
        }}
      />
    </section>
  );
}
