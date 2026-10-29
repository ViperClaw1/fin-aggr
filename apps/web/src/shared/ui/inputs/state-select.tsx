'use client';

import { useId } from 'react';
import { US_STATES } from '@/shared/config';

interface StateSelectProps {
  label: string;
  /** A two-letter code, or `''` when nothing is selected. */
  value: string;
  name?: string;
  onChange: (code: string) => void;
}

export function StateSelect({ label, value, name, onChange }: StateSelectProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => {
          onChange(e.currentTarget.value);
        }}
        className="rounded border border-border bg-background px-2 py-1"
      >
        <option value="">Select a state</option>
        {US_STATES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
