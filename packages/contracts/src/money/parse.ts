// String-only parsing (ADR-013): no float, no Number(), no decimal.js.
import { Cents } from './cents';
import { MoneyParseError } from './errors';
import { Rate } from './rate';

const USD = /^(-)?\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/;
const DECIMAL = /^(\d+)(?:\.(\d+))?$/;
// A rate-shaped number without redundant leading zeros: "01" and "00.5" are malformed.
const RATE_LIKE = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/;
const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

/** Integer digit string → number; exact because the caller checked the safe range. */
function digitsToInt(digits: string): number {
  let value = 0;
  for (const ch of digits) value = value * 10 + (ch.charCodeAt(0) - 48);
  return value;
}

const stripLeadingZeros = (s: string): string => s.replace(/^0+(?=\d)/, '');
const stripTrailingZeros = (s: string): string => s.replace(/0+$/, '');

/**
 * "1,234.56" → 123456. Accepts an optional leading "-" and "$". Decimals past the second
 * must be zeros ("1.500" → 150); any other third decimal is `too_many_decimals`, never rounded.
 */
export function parseCents(input: string): Cents {
  const match = USD.exec(input.trim());
  if (!match) throw new MoneyParseError('invalid_format', input);
  const [, sign, whole = '', fraction = ''] = match;
  if (/[1-9]/.test(fraction.slice(2))) throw new MoneyParseError('too_many_decimals', input);
  const digits = stripLeadingZeros(whole.replaceAll(',', '') + fraction.slice(0, 2).padEnd(2, '0'));
  if (BigInt(digits) > MAX_CENTS) throw new MoneyParseError('out_of_range', input);
  const value = digitsToInt(digits);
  return Cents.parse(sign === '-' && value !== 0 ? -value : value);
}

/**
 * An integer string of cents such as "-150" → -150, for engine output that is already rounded.
 * No separators, no decimals; outside the safe range is `out_of_range`. "-0" → 0.
 */
export function centsFromInteger(digits: string): Cents {
  const match = /^(-)?(\d+)$/.exec(digits);
  if (!match) throw new MoneyParseError('invalid_format', digits);
  const [, sign, whole = ''] = match;
  if (BigInt(whole) > MAX_CENTS) throw new MoneyParseError('out_of_range', digits);
  const value = digitsToInt(stripLeadingZeros(whole));
  return Cents.parse(sign === '-' && value !== 0 ? -value : value);
}

/**
 * A safe integer → Cents without running the zod schema, for UI code that should not pull zod
 * into the first-load bundle (ADR-016). Same rule as the schema: a safe integer; "-0" → 0.
 */
export function centsFromSafeInteger(value: number): Cents {
  if (!Number.isSafeInteger(value)) throw new MoneyParseError('out_of_range', String(value));
  return (value === 0 ? 0 : value) as Cents;
}

/** A fraction string such as "0.0435" (0 ≤ r ≤ 1, up to 8 decimals). */
export function parseRate(fraction: string): Rate {
  const text = fraction.trim();
  const parsed = Rate.safeParse(text);
  if (parsed.success) return parsed.data;
  const match = RATE_LIKE.exec(text);
  if (!match) throw new MoneyParseError('invalid_format', fraction);
  if ((match[1] ?? '').length > 8) throw new MoneyParseError('too_many_decimals', fraction);
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
