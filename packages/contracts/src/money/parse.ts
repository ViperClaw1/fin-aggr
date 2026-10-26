// String-only parsing (ADR-013): no float, no Number(), no decimal.js.
import { Cents } from './cents';
import { MoneyParseError } from './errors';
import { Rate } from './rate';

const USD = /^(-)?\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;
const USD_TOO_PRECISE = /^-?\$?[\d,]+\.\d{3,}$/;
const DECIMAL = /^(\d+)(?:\.(\d+))?$/;
const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

/** Integer digit string → number; exact because the caller checked the safe range. */
function digitsToInt(digits: string): number {
  let value = 0;
  for (const ch of digits) value = value * 10 + (ch.charCodeAt(0) - 48);
  return value;
}

const stripLeadingZeros = (s: string): string => s.replace(/^0+(?=\d)/, '');
const stripTrailingZeros = (s: string): string => s.replace(/0+$/, '');

/** "1,234.56" → 123456. Accepts an optional leading "-" and "$"; at most two decimals. */
export function parseCents(input: string): Cents {
  const text = input.trim();
  if (USD_TOO_PRECISE.test(text)) throw new MoneyParseError('too_many_decimals', input);
  const match = USD.exec(text);
  if (!match) throw new MoneyParseError('invalid_format', input);
  const [, sign, whole = '', fraction = ''] = match;
  const digits = stripLeadingZeros(whole.replaceAll(',', '') + fraction.padEnd(2, '0'));
  if (BigInt(digits) > MAX_CENTS) throw new MoneyParseError('out_of_range', input);
  const value = digitsToInt(digits);
  return Cents.parse(sign === '-' && value !== 0 ? -value : value);
}

/** A fraction string such as "0.0435" (0 ≤ r ≤ 1, up to 8 decimals). */
export function parseRate(fraction: string): Rate {
  const text = fraction.trim();
  const parsed = Rate.safeParse(text);
  if (parsed.success) return parsed.data;
  const match = DECIMAL.exec(text);
  if (!match) throw new MoneyParseError('invalid_format', fraction);
  if ((match[2] ?? '').length > 8) throw new MoneyParseError('too_many_decimals', fraction);
  throw new MoneyParseError('out_of_range', fraction);
}

/** "4.35" → "0.0435": the decimal point moves two places left on the string; no trailing zeros. */
export function rateFromPercent(percent: string): Rate {
  const match = DECIMAL.exec(percent.trim());
  if (!match) throw new MoneyParseError('invalid_format', percent);
  const [, whole = '', fraction = ''] = match;
  const padded = whole.padStart(3, '0');
  const intPart = stripLeadingZeros(padded.slice(0, -2));
  const fracPart = stripTrailingZeros(padded.slice(-2) + fraction);
  if (fracPart.length > 8) throw new MoneyParseError('too_many_decimals', percent);
  const parsed = Rate.safeParse(fracPart === '' ? intPart : `${intPart}.${fracPart}`);
  if (!parsed.success) throw new MoneyParseError('out_of_range', percent);
  return parsed.data;
}
