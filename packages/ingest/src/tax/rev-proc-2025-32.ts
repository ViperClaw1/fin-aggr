import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  centsFromInteger,
  rateFromPercent,
  type Cents,
  type FilingStatus,
  type Rate,
} from '@fa/contracts';

/**
 * Draft of Rev. Proc. 2025-32 § 4.01 tables 1–4 (taxable years beginning in 2026).
 * Not a fixture and not `TAX_YEAR`. Status stays unverified until a person confirms it.
 * Table 5 (estates and trusts) is not a filing status.
 */

const SOURCE_URL = 'https://www.irs.gov/irb/2025-45_IRB';

const STATUS_BY_COLUMN: Record<string, FilingStatus> = {
  A: 'married_joint',
  B: 'head_of_household',
  C: 'single',
  D: 'married_separate',
};

function rowPattern(): RegExp {
  return /Not over (\$[0-9,]+) (\d+)% of the taxable income|Over (\$[0-9,]+) but not over (\$[0-9,]+) \$[0-9,.]+ plus (\d+)% of the excess over \$[0-9,]+|Over (\$[0-9,]+) \$[0-9,.]+ plus (\d+)% of the excess over \$[0-9,]+/g;
}

interface DraftBracket {
  upTo: Cents | null;
  rate: Rate;
  quote: string;
}

interface DraftTable {
  filingStatus: FilingStatus;
  section: string;
  brackets: DraftBracket[];
}

interface FederalBracketDraft {
  taxYear: 2026;
  sourceUrl: string;
  page: number;
  verification: { status: 'unverified' };
  isMock: false;
  tables: DraftTable[];
}

function digitsToInt(digits: string): number {
  let value = 0;
  for (const ch of digits) value = value * 10 + (ch.charCodeAt(0) - 48);
  return value;
}

function dollarsToCents(token: string): Cents {
  const digits = token.replaceAll('$', '').replaceAll(',', '');
  if (!/^[0-9]+$/.test(digits)) throw new Error('rev proc 2025-32 invalid');
  return centsFromInteger(`${digits}00`);
}

function bracketFrom(match: RegExpMatchArray): DraftBracket {
  const quote = match[0];
  const open = match[6];
  const upper = match[1] ?? match[4];
  const percent = match[2] ?? match[5] ?? match[7];
  if (quote.length > 400 || percent === undefined) {
    throw new Error('rev proc 2025-32 invalid');
  }
  if (open !== undefined) return { upTo: null, rate: rateFromPercent(percent), quote };
  if (upper === undefined) throw new Error('rev proc 2025-32 invalid');
  return { upTo: dollarsToCents(upper), rate: rateFromPercent(percent), quote };
}

function bracketsFrom(table: string): DraftBracket[] {
  const brackets: DraftBracket[] = [];
  for (const match of table.matchAll(rowPattern())) brackets.push(bracketFrom(match));
  if (brackets.length === 0 || brackets[brackets.length - 1]?.upTo !== null) {
    throw new Error('rev proc 2025-32 invalid');
  }
  return brackets;
}

/** Reads the saved bulletin excerpt. Thresholds are the "not over" dollar figures, in cents. */
export function federalBrackets2026(): FederalBracketDraft {
  const text = readFileSync(join(import.meta.dirname, 'rev-proc-2025-32.txt'), 'utf8');
  const pageMatch = /Rev\. Proc\. 2025-32, page (\d+)\./.exec(text);
  const pageDigits = pageMatch?.[1];
  if (pageDigits === undefined || !/^[0-9]+$/.test(pageDigits)) {
    throw new Error('rev proc 2025-32 invalid');
  }
  const chunks = text.split(/(?=TABLE \d+ )/).filter((chunk) => chunk.startsWith('TABLE '));
  const tables = chunks.map((chunk) => {
    const heading = /TABLE \d+ - Section 1\(j\)\(2\)\(([A-D])\)/.exec(chunk);
    const column = heading?.[1];
    if (column === undefined) throw new Error('rev proc 2025-32 invalid');
    const filingStatus = STATUS_BY_COLUMN[column];
    if (filingStatus === undefined) throw new Error('rev proc 2025-32 invalid');
    return {
      filingStatus,
      section: `1(j)(2)(${column})`,
      brackets: bracketsFrom(chunk),
    };
  });
  if (tables.length !== 4) throw new Error('rev proc 2025-32 invalid');
  return {
    taxYear: 2026,
    sourceUrl: SOURCE_URL,
    page: digitsToInt(pageDigits),
    verification: { status: 'unverified' },
    isMock: false,
    tables,
  };
}
