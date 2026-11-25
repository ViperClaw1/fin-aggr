'use client';

// Export to a file, import from one, erase everything. The file is made and read in the browser;
// nothing is uploaded (ADR-004). Importing over a non-empty profile asks first.
import type { ProfileDraft } from '@fa/contracts';
import { useId, useRef, useState } from 'react';
import { exportProfile, useProfileActions, useProfileDraft } from '@/entities/profile';
import { IMPORT_ERROR_MESSAGES, importFile } from '../model/import-file';
import { EraseProfile } from './erase-profile';
import { BUTTON, InlineConfirm } from './inline-confirm';

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

function ExportButton({ draft, disabled }: { draft: ProfileDraft; disabled: boolean }) {
  return (
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
  );
}

interface DropZoneProps {
  id: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled: boolean;
  onFile: (file: File) => void;
}

// The native file input covers the whole zone, so it handles both click and drop.
function DropZone({ id, inputRef, disabled, onFile }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const stop = () => {
    setDragging(false);
  };
  return (
    <label
      htmlFor={id}
      className={`relative flex flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors focus-within:ring-2 focus-within:ring-foreground has-disabled:opacity-60 ${dragging ? 'border-foreground bg-border/30' : 'border-border hover:border-foreground'}`}
    >
      <span className="font-medium">Import profile</span>
      <span className="text-muted">Drop your .json file here or click to choose</span>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="application/json,.json"
        disabled={disabled}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        onDragEnter={() => {
          setDragging(true);
        }}
        onDragLeave={stop}
        onDrop={stop}
        onChange={(e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          input.value = '';
          if (file !== undefined) onFile(file);
        }}
      />
    </label>
  );
}

const failed = (error: keyof typeof IMPORT_ERROR_MESSAGES) => ({
  error: true,
  text: `Import failed: ${IMPORT_ERROR_MESSAGES[error]}`,
});

export function ProfileFile({ disabled, onReplaced }: ProfileFileProps) {
  const draft = useProfileDraft();
  const { replace } = useProfileActions();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  // a checked file waiting for "Replace", when the current profile is not empty
  const [pending, setPending] = useState<ProfileDraft | null>(null);

  const apply = (next: ProfileDraft) => {
    const ok = replace(next).ok;
    setMessage(ok ? { error: false, text: 'Profile imported.' } : failed('invalid_profile'));
    if (ok) onReplaced();
  };
  const onFile = async (file: File) => {
    const result = await importFile(file);
    if (!result.ok) setMessage(failed(result.error));
    else if (Object.keys(draft).length === 0) apply(result.draft);
    else {
      setMessage(null);
      setPending(result.draft);
    }
  };
  const settle = (next: ProfileDraft | null) => {
    setPending(null);
    if (next === null) setMessage({ error: false, text: 'Import cancelled.' });
    else apply(next);
    inputRef.current?.focus();
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h3 id={`${id}-heading`} className="font-medium">
        Your profile file
      </h3>
      <DropZone
        id={`${id}-import`}
        inputRef={inputRef}
        disabled={disabled}
        onFile={(file) => void onFile(file)}
      />
      {pending === null ? null : (
        <InlineConfirm
          question="Replace your current profile with the one from the file? Export it first to keep a copy."
          confirmLabel="Replace"
          onConfirm={() => {
            settle(pending);
          }}
          onCancel={() => {
            settle(null);
          }}
        />
      )}
      <div aria-live="polite">
        {message === null ? null : (
          <p className={message.error ? 'text-sm text-danger' : 'text-sm'}>{message.text}</p>
        )}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <ExportButton draft={draft} disabled={disabled} />
        <EraseProfile
          disabled={disabled}
          onErased={() => {
            setMessage({ error: false, text: 'Profile erased.' });
            onReplaced();
          }}
        />
      </div>
    </section>
  );
}
