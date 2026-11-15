import * as cheerio from 'cheerio';
import type { HtmlOffer } from './offer';
import { htmlOfferToProduct, PERSONAL_ELIGIBILITY, type BankExtract } from './normalize';

/** Sallie Mae Bank. Certificate fdic:58177, named by the owner. */
export const sallieAdapter = {
  cert: '58177',
  institutionId: 'fdic:58177',
  sourceId: 'bank:fdic:58177',
  url: 'https://www.salliemae.com/savings/certificates-of-deposit',
  kind: 'html' as const,
  timeZone: 'America/Denver',
  selectors: {
    card: '.cmp-rate-card-wrapper',
    term: '.cmp-tag-v2',
    apy: '.cmp-rate-label',
  },
};

const TERM = /^(\d{1,3})-month CD$/i;
const AS_OF = /accurate as of\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i;
const MIN = /minimum deposit and balance is\s+\$(\d{1,3}(?:,\d{3})*)/i;

const SHORT =
  'If your CD has a maturity of twelve (12) months or less, the penalty we impose will equal ninety (90) days of simple interest on the amount withdrawn subject to penalty.';
const LONG =
  'If your CD has a maturity greater than twelve (12) months, the penalty we impose will equal one hundred eighty (180) days of simple interest on the amount withdrawn subject to penalty.';

function monthsOf(digits: string): number {
  let value = 0;
  for (const ch of digits) value = value * 10 + (ch.charCodeAt(0) - 48);
  return value;
}

function dateOf(page: string): string | null {
  const match = AS_OF.exec(page);
  if (match === null) return null;
  const month = (match[1] ?? '').padStart(2, '0');
  const day = (match[2] ?? '').padStart(2, '0');
  return `${match[3] ?? ''}-${month}-${day}`;
}

/** One card is one term. The penalty sentence depends on that term. */
export function extractSallieRates(html: string): HtmlOffer[] {
  const page = cheerio.load(html);
  const text = page('body').text().replace(/\s+/g, ' ');
  const asOf = dateOf(text);
  const min = MIN.exec(text);
  if (asOf === null || min === null) return [];
  const minDollars = (min[1] ?? '').replaceAll(',', '');
  const offers: HtmlOffer[] = [];
  page(sallieAdapter.selectors.card).each((_, card) => {
    const block = page(card);
    const label = block.find(sallieAdapter.selectors.term).first().text().trim();
    const apy = /^(\d+(?:\.\d+)?)%$/.exec(
      block.find(sallieAdapter.selectors.apy).first().text().trim(),
    );
    const term = TERM.exec(label);
    if (apy === null || term === null) return;
    const termMonths = monthsOf(term[1] ?? '');
    const short = termMonths <= 12;
    offers.push({
      name: label,
      category: 'cd',
      termMonths,
      apyPercent: apy[1] ?? '',
      asOf,
      minDollars,
      compounding: 'monthly',
      penaltyDays: short ? 90 : 180,
      quote: short ? SHORT : LONG,
    });
  });
  return offers;
}

/** One product per CD card. The penalty follows the term on the same page. */
export function readSallie(html: string): BankExtract {
  return {
    products: extractSallieRates(html).map((offer) =>
      htmlOfferToProduct({
        offer,
        institutionId: sallieAdapter.institutionId,
        url: sallieAdapter.url,
        eligibility: PERSONAL_ELIGIBILITY,
      }),
    ),
    extra: [],
  };
}
