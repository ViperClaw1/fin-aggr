import type { HtmlTableConfig } from './config';

/**
 * Banks read by configuration (plan 8.5). A new bank on a known page shape is a row here, a
 * saved snapshot and a test; no new code. Model-proposed configs move to `adapter_configs` (8.6).
 */

const WORD = '[a-z]+(?: [a-z]+)*';
const penalty = (scope: string): string =>
  `If your CD has a maturity ${scope}, the penalty we impose will equal ${WORD} \\((\\d+)\\) days[’']? simple interest on the amount withdrawn subject to penalty\\.`;

/**
 * Sallie Mae Bank, fdic:58177. Patterns typed from the CD page on 2026-11-16. The flip cards are
 * filled in the browser; the rate table is in the raw HTML. Replaced the code adapter
 * `58177.ts` on 2026-11-26 after both read the same products.
 */
export const SALLIE_CONFIG: HtmlTableConfig = {
  kind: 'html_table',
  institutionId: 'fdic:58177',
  bankName: 'Sallie Mae Bank',
  url: 'https://www.salliemae.com/savings/certificates-of-deposit/',
  timeZone: 'America/Denver',
  category: 'cd',
  name: '{term}-month CD',
  caption: 'Certificate of Deposit (CD) rates table',
  columns: { term: 0, apy: 1 },
  apy: '^(\\d+(?:\\.\\d+)?)% APY\\b',
  page: {
    asOf: 'Certificates of Deposit[\\s\\S]{0,220}?accurate as of\\s+(\\d{1,2})/(\\d{1,2})/(\\d{4})',
    minDollars: 'minimum deposit and balance is\\s+\\$(\\d{1,3}(?:,\\d{3})*)',
    compounding: {
      pattern: 'compounded interest gets credited to your CD monthly',
      value: 'monthly',
    },
    penalties: [
      { maxTermMonths: 12, pattern: penalty('of twelve \\(12\\) months or less') },
      { maxTermMonths: null, pattern: penalty('greater than twelve \\(12\\) months') },
    ],
    eligibility: {
      pattern: 'Certificates of Deposit[\\s\\S]{0,220}?personal accounts only',
      label: 'Personal accounts only',
    },
  },
};

export const CONFIG_BANKS: readonly HtmlTableConfig[] = [SALLIE_CONFIG];
