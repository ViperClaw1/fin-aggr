'use client';

// "Erase profile" asks in the page, not with confirm(): focus moves to Cancel when the question
// opens and back to the button when it closes.
import { useEffect, useId, useRef, useState } from 'react';
import { useProfileActions } from '@/entities/profile';

export const BUTTON = 'rounded border border-border px-3 py-1.5 disabled:opacity-50';

interface EraseProfileProps {
  disabled: boolean;
  onErased: () => void;
}

export function EraseProfile({ disabled, onErased }: EraseProfileProps) {
  const { clearAll } = useProfileActions();
  const questionId = useId();
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const eraseRef = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (asked.current) eraseRef.current?.focus();
    asked.current = confirming;
  }, [confirming]);

  if (!confirming)
    return (
      <button
        ref={eraseRef}
        type="button"
        disabled={disabled}
        className={`${BUTTON} self-start`}
        onClick={() => {
          setConfirming(true);
        }}
      >
        Erase profile
      </button>
    );
  return (
    <div
      role="group"
      aria-labelledby={questionId}
      className="flex flex-col gap-2 rounded border border-danger p-3"
    >
      <p id={questionId}>
        Erase your profile from this browser? This cannot be undone. Export it first to keep a copy.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-danger bg-danger-bg px-3 py-1.5 font-medium text-danger"
          onClick={() => {
            clearAll();
            setConfirming(false);
            onErased();
          }}
        >
          Erase
        </button>
        <button
          ref={cancelRef}
          type="button"
          className={BUTTON}
          onClick={() => {
            setConfirming(false);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
