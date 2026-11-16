import * as cheerio from 'cheerio';
import type { HtmlOffer } from './offer';
import {
  htmlOfferToProduct,
  PERSONAL_ELIGIBILITY,
  UNSTATED_ELIGIBILITY,
  type BankExtract,
} from './normalize';

/**
 * Sallie Mae Bank. Certificate fdic:58177, named by the owner.
 * The flip cards are filled in the browser. The rate table is in the raw HTML
 * (checked 2026-11-16 with the project User-Agent). The same page states the penalty.
 */
export const sallieAdapter = {
  cert: '58177',
  institutionId: 'fdic:58177',
  sourceId: 'bank:fdic:58177',
  url: 'https://www.salliemae.com/savings/certificates-of-deposit/',
  kind: 'html' as const,
  timeZone: 'America/Denver',
  selectors: {
    table: 'table',
    caption: 'caption',
    row: 'tr',
  },
};

const CAPTION = 'Certificate of Deposit (CD) rates table';
const TERM = /^(\d{1,3}) months$/i;
const APY = /^(\d+(?:\.\d+)?)% APY\b/i;
const AS_OF =
  /Certificates of Deposit[\s\S]{0,220}?accurate as of\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i;
const PERSONAL = /Certificates of Deposit[\s\S]{0,220}?personal accounts only/i;
const MIN = /minimum deposit and balance is\s+\$(\d{1,3}(?:,\d{3})*)/i;
const COMPOUND = /compounded interest gets credited to your CD monthly/i;
const WORD = '[a-z]+(?: [a-z]+)*';
const SHORT = new RegExp(
  `If your CD has a maturity of twelve \\(12\\) months or less, the penalty we impose will equal ${WORD} \\((\\d+)\\) days[’']? simple interest on the amount withdrawn subject to penalty\\.`,
  'i',
);
const LONG = new RegExp(
  `If your CD has a maturity greater than twelve \\(12\\) months, the penalty we impose will equal ${WORD} \\((\\d+)\\) days[’']? simple interest on the amount withdrawn subject to penalty\\.`,
  'i',
);

function digits(raw: string): number {
  let value = 0;
  for (const ch of raw) value = value * 10 + (ch.charCodeAt(0) - 48);
  return value;
}

function flat(value: string): string {
  return value.replaceAll('\u00a0', ' ').replace(/\s+/g, ' ').trim();
}

function dateOf(page: string): string | null {
  const match = AS_OF.exec(page);
  if (match === null) return null;
  const month = (match[1] ?? '').padStart(2, '0');
  const day = (match[2] ?? '').padStart(2, '0');
  return `${match[3] ?? ''}-${month}-${day}`;
}

interface Penalty {
  days: number;
  quote: string;
}

function penaltyOf(pattern: RegExp, page: string): Penalty | null {
  const match = pattern.exec(page);
  const days = match?.[1];
  const quote = match?.[0];
  if (days === undefined || quote === undefined) return null;
  return { days: digits(days), quote };
}

/**
 * One table row is one term. A row without a term or an APY is skipped.
 * Both penalty sentences have to be on the page. A missing sentence is not a guessed day count.
 */
export function extractSallieRates(html: string): HtmlOffer[] {
  const page = cheerio.load(html);
  const text = flat(page('body').text());
  const asOf = dateOf(text);
  const min = MIN.exec(text);
  const short = penaltyOf(SHORT, text);
  const long = penaltyOf(LONG, text);
  if (asOf === null || min === null || short === null || long === null || !COMPOUND.test(text)) {
    return [];
  }
  const minDollars = (min[1] ?? '').replaceAll(',', '');
  const offers: HtmlOffer[] = [];
  page(sallieAdapter.selectors.table)
    .filter((_, table) =>
      flat(page(table).find(sallieAdapter.selectors.caption).text()).includes(CAPTION),
    )
    .find(sallieAdapter.selectors.row)
    .each((_, row) => {
      const cells = page(row).find('th, td');
      const label = flat(page(cells[0]).text());
      const apy = APY.exec(flat(page(cells[1]).text()));
      const term = TERM.exec(label);
      if (apy === null || term === null) return;
      const termMonths = digits(term[1] ?? '');
      const penalty = termMonths <= 12 ? short : long;
      offers.push({
        name: `${String(termMonths)}-month CD`,
        category: 'cd',
        termMonths,
        apyPercent: apy[1] ?? '',
        asOf,
        minDollars,
        compounding: 'monthly',
        penaltyDays: penalty.days,
        quote: penalty.quote,
      });
    });
  return offers;
}

/** One product per CD table row. The penalty sentence is the one that names that term. */
export function readSallie(html: string): BankExtract {
  const text = flat(cheerio.load(html)('body').text());
  return {
    products: extractSallieRates(html).map((offer) =>
      htmlOfferToProduct({
        offer,
        institutionId: sallieAdapter.institutionId,
        url: sallieAdapter.url,
        eligibility: PERSONAL.test(text) ? PERSONAL_ELIGIBILITY : UNSTATED_ELIGIBILITY,
      }),
    ),
    extra: [],
  };
}
