'use client';

// A question in the page instead of confirm(): focus moves to Cancel when it appears. The caller
// returns focus where it belongs once the question is gone.
import { useEffect, useId, useRef } from 'react';

export const BUTTON = 'btn';

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
      className="flex flex-col gap-3 rounded-md border border-danger p-3"
    >
      <p id={id}>{question}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn border-danger bg-danger-bg text-danger hover:bg-danger-bg"
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
