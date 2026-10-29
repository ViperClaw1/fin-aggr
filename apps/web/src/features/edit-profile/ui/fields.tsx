'use client';

// Form fields the shared inputs do not cover: a select of labelled codes and a whole number.
import { useId, useState } from 'react';
import { parseWholeNumber } from '../model/whole-number';

interface ChoiceFieldProps<T extends string> {
  label: string;
  name: string;
  labels: Record<T, string>;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}

export function ChoiceField<T extends string>({
  label,
  name,
  labels,
  value,
  onChange,
}: ChoiceFieldProps<T>) {
  const id = useId();
  const codes = Object.keys(labels) as T[];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value ?? ''}
        onChange={(e) => {
          const code = codes.find((c) => c === e.currentTarget.value);
          onChange(code);
        }}
        className="control"
      >
        <option value="">Select</option>
        {codes.map((code) => (
          <option key={code} value={code}>
            {labels[code]}
          </option>
        ))}
      </select>
    </div>
  );
}

interface WholeNumberFieldProps {
  label: string;
  name: string;
  hint?: string;
  defaultValue: number | null | undefined;
  /** Called on blur with a valid value, or `null` when the field is cleared. */
  onValueChange: (value: number | null) => void;
}

export function WholeNumberField({
  label,
  name,
  hint,
  defaultValue,
  onValueChange,
}: WholeNumberFieldProps) {
  const id = useId();
  const [invalid, setInvalid] = useState(false);
  const describedBy = [hint === undefined ? '' : `${id}-hint`, invalid ? `${id}-error` : '']
    .filter((s) => s !== '')
    .join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        defaultValue={
          defaultValue === null || defaultValue === undefined ? '' : String(defaultValue)
        }
        aria-invalid={invalid}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        onBlur={(e) => {
          const result = parseWholeNumber(e.currentTarget.value);
          setInvalid(!result.ok);
          if (result.ok) onValueChange(result.value);
        }}
        className="control"
      />
      {invalid ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          Enter a whole number, for example 12.
        </p>
      ) : null}
    </div>
  );
}
