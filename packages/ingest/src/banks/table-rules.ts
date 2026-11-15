import { shortQuote } from '../scrape/rules';

/**
 * HTML rate tables (ADR-020). ACCESSbank is not connected.
 * A term span is not one termMonths. An empty bank date is not the fetch time.
 */

export const BANK_DATE_NOT_STATED = 'bank date not stated';

const MONTH = String.raw`months?`;
const SPAN = String.raw`(?:\u2013|\u2014|-|to)`;
const RANGE = new RegExp(String.raw`^(\d{1,3})\s*${SPAN}\s*(\d{1,3})\s*-?\s*${MONTH}$`, 'i');
const EXACT = new RegExp(String.raw`^(\d{1,3})\s*-?\s*${MONTH}$`, 'i');
const CONDITIONAL = /new money|requirements met/i;

interface TermRange {
  low: number;
  high: number;
  text: string;
}

export interface TableRowInput {
  termText: string;
  conditionText: string;
  asOfText: string | null;
  /** False when the bank does not open accounts online in every state. */
  opensOnlineNationwide: boolean;
}

export interface TableRowReading {
  termMonths: number | null;
  termRange: TermRange | null;
  statedAsOf: string | null;
  dateFlag: typeof BANK_DATE_NOT_STATED | null;
  reviews: readonly string[];
}

interface TermReading {
  termMonths: number | null;
  termRange: TermRange | null;
  review: string | null;
}

function monthCount(digits: string): number | null {
  if (!/^[1-9]\d{0,2}$/.test(digits)) return null;
  let value = 0;
  for (const ch of digits) value = value * 10 + (ch.charCodeAt(0) - 48);
  return value;
}

/** A span stays a span. The low end, the high end, and the midpoint are not termMonths. */
function termReading(termText: string): TermReading {
  const text = termText.trim();
  if (text === '') return { termMonths: null, termRange: null, review: null };
  const range = RANGE.exec(text);
  if (range !== null) return rangeReading(text, range[1] ?? '', range[2] ?? '');
  const exact = EXACT.exec(text);
  const months = exact === null ? null : monthCount(exact[1] ?? '');
  if (months === null) return { termMonths: null, termRange: null, review: 'term_unparsed' };
  return { termMonths: months, termRange: null, review: null };
}

function rangeReading(text: string, lowDigits: string, highDigits: string): TermReading {
  const low = monthCount(lowDigits);
  const high = monthCount(highDigits);
  if (low === null || high === null || low > high) {
    return { termMonths: null, termRange: null, review: 'term_unparsed' };
  }
  if (low === high) return { termMonths: low, termRange: null, review: null };
  return {
    termMonths: null,
    termRange: { low, high, text },
    review: `term_range:${String(low)}-${String(high)}`,
  };
}

function conditionDetail(termText: string, conditionText: string): string | null {
  const condition = conditionText.trim();
  if (condition !== '' && CONDITIONAL.test(condition)) return shortQuote(condition);
  const term = termText.trim();
  if (term !== '' && CONDITIONAL.test(term)) return shortQuote(term);
  return null;
}

/** Review reasons, in order: term, condition, missing bank date, state list. */
export function classifyTableRow(input: TableRowInput): TableRowReading {
  const term = termReading(input.termText);
  const stated = input.asOfText?.trim() ?? '';
  const dateFlag = stated === '' ? BANK_DATE_NOT_STATED : null;
  const condition = conditionDetail(input.termText, input.conditionText);
  const reviews = [
    term.review,
    condition === null ? null : `condition:${condition}`,
    dateFlag,
    input.opensOnlineNationwide ? null : 'state_eligibility',
  ].filter((item): item is string => item !== null);
  return {
    termMonths: term.termMonths,
    termRange: term.termRange,
    statedAsOf: stated === '' ? null : stated,
    dateFlag,
    reviews,
  };
}
