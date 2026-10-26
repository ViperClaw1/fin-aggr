// Display formatting on integers and strings only (ADR-013).
import type { Cents } from './cents';
import type { Rate } from './rate';

const groupThousands = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 123456 → "$1,234.56"; -5 → "-$0.05". */
export function formatUsd(value: Cents): string {
  const negative = value < 0;
  const abs = negative ? -BigInt(value) : BigInt(value);
  const dollars = groupThousands((abs / 100n).toString());
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}$${dollars}.${cents}`;
}

/** "0.0435" → "4.35%". Exact: the decimal point moves two places right on the string. */
export function formatRate(rate: Rate): string {
  const [whole = '0', fraction = ''] = rate.split('.');
  const shifted = fraction.padEnd(2, '0');
  const intPart = (whole + shifted.slice(0, 2)).replace(/^0+(?=\d)/, '');
  const fracPart = shifted.slice(2).replace(/0+$/, '');
  return `${fracPart === '' ? intPart : `${intPart}.${fracPart}`}%`;
}
