// Money brands without zod (ADR-016 D3): the rules live here once; the zod schemas in cents.ts and
// rate.ts are built on them, and a property test keeps both in agreement. UI and engine code call
// these, so zod stays out of the client bundle.
import type { Cents } from './cents';
import { MoneyParseError } from './errors';
import { RATE_RE, SIGNED_RATE_RE } from '../patterns';
import type { Rate, SignedRate } from './rate';

export const isCents = (v: unknown): v is Cents => typeof v === 'number' && Number.isSafeInteger(v);
export const isRate = (v: unknown): v is Rate => typeof v === 'string' && RATE_RE.test(v);
export const isSignedRate = (v: unknown): v is SignedRate =>
  typeof v === 'string' && SIGNED_RATE_RE.test(v);

/** "0.0435" → Rate; anything else is `invalid_format`. */
export function asRate(text: string): Rate {
  if (!isRate(text)) throw new MoneyParseError('invalid_format', text);
  return text;
}

export function asSignedRate(text: string): SignedRate {
  if (!isSignedRate(text)) throw new MoneyParseError('invalid_format', text);
  return text;
}

/** Cents from a safe integer; "-0" → 0. */
export function asCents(value: number): Cents {
  if (!isCents(value)) throw new MoneyParseError('out_of_range', String(value));
  return (value === 0 ? 0 : value) as Cents;
}

export const RATE_ZERO = '0' as Rate;
