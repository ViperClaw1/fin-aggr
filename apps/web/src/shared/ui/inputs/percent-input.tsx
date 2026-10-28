'use client';

import { formatRate, type Rate } from '@fa/contracts';
import { DecimalInput } from './decimal-input';
import { parsePercentInput } from './parse-input';

interface PercentInputProps {
  label: string;
  hint?: string;
  defaultValue?: Rate;
  onValueChange: (value: Rate | null) => void;
}

/** The user types a percent ("4.35"); the value is a Rate fraction ("0.0435"). */
export function PercentInput({ label, hint, defaultValue, onValueChange }: PercentInputProps) {
  return (
    <DecimalInput
      label={label}
      hint={hint}
      defaultText={defaultValue === undefined ? '' : formatRate(defaultValue)}
      parse={parsePercentInput}
      onValueChange={onValueChange}
    />
  );
}
