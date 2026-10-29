'use client';

// A question in the page instead of confirm(): focus moves to Cancel when it appears. The caller
// returns focus where it belongs once the question is gone.
import { useEffect, useId, useRef } from 'react';

export const BUTTON = 'rounded border border-border px-3 py-1.5 disabled:opacity-50';

interface InlineConfirmProps {
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function InlineConfirm({ question, confirmLabel, onConfirm, onCancel }: InlineConfirmProps) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="flex flex-col gap-2 rounded border border-danger p-3"
    >
      <p id={id}>{question}</p>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-danger bg-danger-bg px-3 py-1.5 font-medium text-danger"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button ref={cancelRef} type="button" className={BUTTON} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
