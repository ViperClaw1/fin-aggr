'use client';

// "Erase profile" asks first; focus returns to the button when the question closes.
import { useEffect, useRef, useState } from 'react';
import { PROFILE_PRIVACY_TEXT, useProfileActions } from '@/entities/profile';
import { BUTTON, InlineConfirm } from './inline-confirm';

interface EraseProfileProps {
  disabled: boolean;
  onErased: () => void;
}

export function EraseProfile({ disabled, onErased }: EraseProfileProps) {
  const { clearAll } = useProfileActions();
  const [confirming, setConfirming] = useState(false);
  const eraseRef = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (!confirming && asked.current) eraseRef.current?.focus();
    asked.current = confirming;
  }, [confirming]);

  if (confirming)
    return (
      <InlineConfirm
        question={PROFILE_PRIVACY_TEXT.eraseQuestion}
        confirmLabel="Erase"
        onConfirm={() => {
          clearAll();
          setConfirming(false);
          onErased();
        }}
        onCancel={() => {
          setConfirming(false);
        }}
      />
    );
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
}
