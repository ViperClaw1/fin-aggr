// Text → Cents/Rate for form fields. Parsing itself lives in @fa/contracts (ADR-013); this only
// turns its MoneyParseError into a result the field can show.
import {
  type Cents,
  MoneyParseError,
  type MoneyParseErrorCode,
  parseCents,
  type Rate,
  rateFromPercent,
} from '@fa/contracts';

export type InputErrorCode = MoneyParseErrorCode | 'negative';

/** Empty text is `value: null`: the field is cleared, not invalid. */
export type ParseResult<T> = { ok: true; value: T | null } | { ok: false; code: InputErrorCode };

export const INPUT_ERROR_MESSAGES: Record<InputErrorCode, string> = {
  invalid_format: 'Enter a number, for example 1,234.56.',
  too_many_decimals: 'Too many decimal places.',
  out_of_range: 'This value is out of range.',
  negative: 'Enter zero or a positive amount.',
};

/** Catches only MoneyParseError; anything else is a bug and is rethrown. */
export function tryParse<T>(parse: (text: string) => T, text: string): ParseResult<T> {
  if (text.trim() === '') return { ok: true, value: null };
  try {
    return { ok: true, value: parse(text) };
  } catch (error) {
    if (error instanceof MoneyParseError) return { ok: false, code: error.code };
    throw error;
  }
}

export function parseMoneyInput(text: string, allowNegative: boolean): ParseResult<Cents> {
  const result = tryParse(parseCents, text);
  if (!allowNegative && result.ok && result.value !== null && result.value < 0) {
    return { ok: false, code: 'negative' };
  }
  return result;
}

/** "4.35" or "4.35%" → "0.0435". */
export const parsePercentInput = (text: string): ParseResult<Rate> =>
  tryParse(rateFromPercent, text.trim().replace(/%$/, ''));
