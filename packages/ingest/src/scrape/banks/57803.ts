import * as cheerio from 'cheerio';
import type { HtmlOffer } from './offer';
import { htmlOfferToProduct, UNSTATED_ELIGIBILITY, type BankExtract } from './normalize';

/** Ally Bank. Certificate from FDIC institutions, name "Ally Bank", 2026-11-13. */
export const allyAdapter = {
  cert: '57803',
  institutionId: 'fdic:57803',
  sourceId: 'bank:fdic:57803',
  url: 'https://www.ally.com/bank/view-rates/',
  kind: 'html' as const,
  timeZone: 'America/Denver',
  /** Card heading, then the rate line inside that card. */
  selectors: { card: 'section', heading: 'h3', rate: 'p' },
};

const RATE = /(\d+(?:\.\d+)?)%\s*correct as of\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
const TERM = /(\d{1,3})\s*-?\s*months?/i;

function yearOf(raw: string): string {
  return raw.length === 2 ? `20${raw}` : raw;
}

function pad(value: string): string {
  return value.padStart(2, '0');
}

/** Savings with a stated rate. A CD card without its own term is not a product. */
export function extractAllyRates(html: string): HtmlOffer[] {
  const page = cheerio.load(html);
  const offers: HtmlOffer[] = [];
  page(allyAdapter.selectors.card).each((_, card) => {
    const block = page(card);
    const name = block.find(allyAdapter.selectors.heading).first().text().trim();
    const text = block.text().replace(/\s+/g, ' ').trim();
    const rate = RATE.exec(text);
    if (name === '' || rate === null) return;
    const apyPercent = rate[1] ?? '';
    const asOf = `${yearOf(rate[4] ?? '')}-${pad(rate[2] ?? '')}-${pad(rate[3] ?? '')}`;
    if (name === 'Savings') {
      offers.push({
        name,
        category: 'savings',
        termMonths: null,
        apyPercent,
        asOf,
        minDollars: '0',
        compounding: 'daily',
        penaltyDays: null,
        quote: 'Access your money at any time.',
      });
      return;
    }
    const term = TERM.exec(text);
    if (!name.endsWith('CD') || term === null) return;
    let months = 0;
    for (const ch of term[1] ?? '') months = months * 10 + (ch.charCodeAt(0) - 48);
    offers.push({
      name,
      category: 'cd',
      termMonths: months,
      apyPercent,
      asOf,
      minDollars: '0',
      compounding: 'daily',
      penaltyDays: null,
      quote: text.slice(0, 180),
    });
  });
  return offers;
}

/** Cards on the Ally rates page. A CD without a term is not a product. */
export function readAlly(html: string): BankExtract {
  return {
    products: extractAllyRates(html).map((offer) =>
      htmlOfferToProduct({
        offer,
        institutionId: allyAdapter.institutionId,
        url: allyAdapter.url,
        eligibility: UNSTATED_ELIGIBILITY,
      }),
    ),
    extra: [],
  };
}
