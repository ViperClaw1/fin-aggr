'use client';

import { formatRate, type Rate } from '@fa/contracts';
import { DecimalInput } from './decimal-input';
import { parsePercentInput } from './parse-input';

interface PercentInputProps {
  label: string;
  hint?: string;
  name?: string;
  defaultValue?: Rate | null | undefined;
  onValueChange: (value: Rate | null) => void;
}

/** The user types a percent ("4.35"); the value is a Rate fraction ("0.0435"). */
export function PercentInput({
  label,
  hint,
  name,
  defaultValue,
  onValueChange,
}: PercentInputProps) {
  return (
    <DecimalInput
      label={label}
      hint={hint}
      name={name}
      defaultText={
        defaultValue === undefined || defaultValue === null ? '' : formatRate(defaultValue)
      }
      parse={parsePercentInput}
      onValueChange={onValueChange}
    />
  );
}
