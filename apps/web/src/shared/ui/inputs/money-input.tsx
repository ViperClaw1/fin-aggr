'use client';

import { type Cents, formatUsd } from '@fa/contracts';
import { DecimalInput } from './decimal-input';
import { parseMoneyInput } from './parse-input';

interface MoneyInputProps {
  label: string;
  hint?: string;
  defaultValue?: Cents;
  /** Fees and refunds may be negative; balances may not. */
  allowNegative?: boolean;
  onValueChange: (value: Cents | null) => void;
}

export function MoneyInput({
  label,
  hint,
  defaultValue,
  allowNegative = false,
  onValueChange,
}: MoneyInputProps) {
  return (
    <DecimalInput
      label={label}
      hint={hint}
      defaultText={defaultValue === undefined ? '' : formatUsd(defaultValue)}
      parse={(text) => parseMoneyInput(text, allowNegative)}
      onValueChange={onValueChange}
    />
  );
}
