'use client';

import { formatUsdShort, parseCents, type Cents } from '@fa/contracts';
import { useId, useState } from 'react';
import { parseMoneyInput } from '@/shared/ui/inputs';

const PRESETS: readonly { label: string; cents: Cents }[] = [
  { label: 'No minimum', cents: parseCents('0') },
  { label: '≤ $500', cents: parseCents('500') },
  { label: '≤ $1,000', cents: parseCents('1000') },
  { label: '≤ $5,000', cents: parseCents('5000') },
];

interface OpeningFilterProps {
  value: Cents | null;
  onChange: (value: Cents | null) => void;
}

export function OpeningFilter({ value, onChange }: OpeningFilterProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? '' : formatUsdShort(value).replace(/^\$/, ''));
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Maximum to open
      </label>
      <div className="relative">
        <span
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted"
          aria-hidden="true"
        >
          $
        </span>
        <input
          id={id}
          inputMode="decimal"
          placeholder="e.g. 1,000"
          value={shown}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={() => {
            const text = draft;
            setDraft(null);
            if (text === null) return;
            if (text.trim() === '') {
              onChange(null);
              return;
            }
            const parsed = parseMoneyInput(text, false);
            if (parsed.ok && parsed.value !== null) onChange(parsed.value);
          }}
          className="control h-8 pl-7 tabular-nums"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const pressed = value !== null && value === preset.cents;
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={pressed}
              onClick={() => {
                setDraft(null);
                onChange(pressed ? null : preset.cents);
              }}
              className={`h-8 rounded-md border px-2 text-xs ${pressed ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
