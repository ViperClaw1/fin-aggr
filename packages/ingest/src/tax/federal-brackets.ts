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
 * Drafts of the federal ordinary brackets, tables 1–4 of the annual Rev. Proc.:
 * - 2026: Rev. Proc. 2025-32 § 4.01, IRB 2025-45 page 695;
 * - 2027: Rev. Proc. 2026-35 § 3.01, irs-drop copy (IRB page not yet known).
 * Not a fixture and not `TAX_YEAR`. Status stays unverified until a person confirms it.
 * Table 5 (estates and trusts) is not a filing status.
 */

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

export interface FederalBracketDraft {
  taxYear: 2026 | 2027;
  revProc: string;
  sourceUrl: string;
  /** IRB page; null while only the irs-drop copy exists. */
  page: number | null;
  verification: { status: 'unverified' };
  isMock: false;
  tables: DraftTable[];
}

const invalid = (revProc: string): Error => new Error(`rev proc ${revProc} invalid`);

function dollarsToCents(token: string, revProc: string): Cents {
  const digits = token.replaceAll('$', '').replaceAll(',', '');
  if (!/^[0-9]+$/.test(digits)) throw invalid(revProc);
  return centsFromInteger(`${digits}00`);
}

function bracketFrom(match: RegExpMatchArray, revProc: string): DraftBracket {
  const quote = match[0];
  const open = match[6];
  const upper = match[1] ?? match[4];
  const percent = match[2] ?? match[5] ?? match[7];
  if (quote.length > 400 || percent === undefined) throw invalid(revProc);
  if (open !== undefined) return { upTo: null, rate: rateFromPercent(percent), quote };
  if (upper === undefined) throw invalid(revProc);
  return { upTo: dollarsToCents(upper, revProc), rate: rateFromPercent(percent), quote };
}

function bracketsFrom(table: string, revProc: string): DraftBracket[] {
  const brackets: DraftBracket[] = [];
  for (const match of table.matchAll(rowPattern())) brackets.push(bracketFrom(match, revProc));
  if (brackets.length === 0 || brackets[brackets.length - 1]?.upTo !== null) {
    throw invalid(revProc);
  }
  return brackets;
}

function tablesFrom(text: string, revProc: string): DraftTable[] {
  const chunks = text.split(/(?=TABLE \d+ )/).filter((chunk) => chunk.startsWith('TABLE '));
  const tables = chunks.map((chunk) => {
    const column = /TABLE \d+ - Section 1\(j\)\(2\)\(([A-D])\)/.exec(chunk)?.[1];
    const filingStatus = column === undefined ? undefined : STATUS_BY_COLUMN[column];
    if (column === undefined || filingStatus === undefined) throw invalid(revProc);
    return { filingStatus, section: `1(j)(2)(${column})`, brackets: bracketsFrom(chunk, revProc) };
  });
  if (tables.length !== 4) throw invalid(revProc);
  return tables;
}

function draft(input: {
  file: string;
  taxYear: FederalBracketDraft['taxYear'];
  revProc: string;
  sourceUrl: string;
  page: number | null;
}): FederalBracketDraft {
  const text = readFileSync(join(import.meta.dirname, input.file), 'utf8');
  if (!text.startsWith(`Rev. Proc. ${input.revProc}`)) throw invalid(input.revProc);
  return {
    taxYear: input.taxYear,
    revProc: input.revProc,
    sourceUrl: input.sourceUrl,
    page: input.page,
    verification: { status: 'unverified' },
    isMock: false,
    tables: tablesFrom(text, input.revProc),
  };
}

/** Thresholds are the "not over" dollar figures, in cents. */
export function federalBrackets2026(): FederalBracketDraft {
  return draft({
    file: 'rev-proc-2025-32.txt',
    taxYear: 2026,
    revProc: '2025-32',
    sourceUrl: 'https://www.irs.gov/irb/2025-45_IRB',
    page: 695,
  });
}

export function federalBrackets2027(): FederalBracketDraft {
  return draft({
    file: 'rev-proc-2026-35.txt',
    taxYear: 2027,
    revProc: '2026-35',
    sourceUrl: 'https://www.irs.gov/pub/irs-drop/rp-26-35.pdf',
    page: null,
  });
}
