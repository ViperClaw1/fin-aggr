'use client';

import { useId, useState } from 'react';
import { INPUT_ERROR_MESSAGES, type InputErrorCode, type ParseResult } from './parse-input';

interface DecimalInputProps<T> {
  label: string;
  hint?: string | undefined;
  defaultText: string;
  parse: (text: string) => ParseResult<T>;
  /** Called on blur with a valid value, or `null` when the field is cleared. */
  onValueChange: (value: T | null) => void;
}

/** Free text with a decimal keypad, parsed on blur. Shared by MoneyInput and PercentInput. */
export function DecimalInput<T>({
  label,
  hint,
  defaultText,
  parse,
  onValueChange,
}: DecimalInputProps<T>) {
  const id = useId();
  const [error, setError] = useState<InputErrorCode | null>(null);
  const describedBy = [hint === undefined ? '' : `${id}-hint`, error === null ? '' : `${id}-error`]
    .filter((s) => s !== '')
    .join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={defaultText}
        aria-invalid={error !== null}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        onBlur={(e) => {
          const result = parse(e.currentTarget.value);
          setError(result.ok ? null : result.code);
          if (result.ok) onValueChange(result.value);
        }}
        className="rounded border border-border bg-background px-2 py-1 aria-invalid:border-danger"
      />
      {error === null ? null : (
        <p id={`${id}-error`} className="text-sm text-danger">
          {INPUT_ERROR_MESSAGES[error]}
        </p>
      )}
    </div>
  );
}
