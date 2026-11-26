import * as cheerio from 'cheerio';
import type { Rule } from '@fa/contracts';
import { classifyTableRow } from '../../banks/table-rules';
import type { HtmlOffer } from './offer';
import { htmlOfferToProduct, UNSTATED_ELIGIBILITY, type BankExtract } from './normalize';

/**
 * Plan step 8.5 (ADR-026): an adapter is data. One executor reads every `html_table` config.
 * Patterns are regular-expression sources run on the page text (whitespace flattened). Every
 * pattern names the number it captures, so a value always comes from a quote on the page.
 * Other kinds (`ld_json`, `json_path`, `pdf_table`) are added with the first bank that needs one.
 */
export interface HtmlTableConfig {
  kind: 'html_table';
  institutionId: string;
  /** Bank name for the `sources` row. */
  bankName: string;
  url: string;
  timeZone: string;
  category: 'cd' | 'savings';
  /** Product name; `{term}` is the term in months. */
  name: string;
  /** Only tables whose caption contains this text. */
  caption: string;
  /** Cell indexes in a row (`th` and `td` alike). */
  columns: { term: number; apy: number };
  /** Group 1 is the APY percent, e.g. `^(\d+(?:\.\d+)?)% APY\b`. */
  apy: string;
  page: {
    /** Groups 1–3 are month, day, year. */
    asOf: string;
    /** Group 1 is whole dollars, commas allowed. */
    minDollars: string;
    compounding: { pattern: string; value: 'daily' | 'monthly' };
    /** Group 1 is the day count. The first band whose `maxTermMonths` covers the term wins. */
    penalties: { maxTermMonths: number | null; pattern: string }[];
    /** When the pattern matches, the eligibility rule carries this label. */
    eligibility?: { pattern: string; label: string };
  };
}

function flat(value: string): string {
  return value.replaceAll(' ', ' ').replace(/\s+/g, ' ').trim();
}

const re = (source: string): RegExp => new RegExp(source, 'i');

function digits(raw: string): number {
  let value = 0;
  for (const ch of raw) value = value * 10 + (ch.charCodeAt(0) - 48);
  return value;
}

interface PageFacts {
  asOf: string;
  minDollars: string;
  penalties: { maxTermMonths: number | null; days: number; quote: string }[];
}

/** Every page fact or none: a missing sentence is not a guessed value. */
function pageFacts(config: HtmlTableConfig, text: string): PageFacts | null {
  const date = re(config.page.asOf).exec(text);
  const min = re(config.page.minDollars).exec(text);
  if (date === null || min === null || !re(config.page.compounding.pattern).test(text)) return null;
  const penalties = [];
  for (const band of config.page.penalties) {
    const match = re(band.pattern).exec(text);
    const days = match?.[1];
    if (match === null || days === undefined) return null;
    penalties.push({ maxTermMonths: band.maxTermMonths, days: digits(days), quote: match[0] });
  }
  const [month, day, year] = [date[1] ?? '', date[2] ?? '', date[3] ?? ''];
  return {
    asOf: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
    minDollars: (min[1] ?? '').replaceAll(',', ''),
    penalties,
  };
}

export function extractTableOffers(config: HtmlTableConfig, html: string): HtmlOffer[] {
  const page = cheerio.load(html);
  const facts = pageFacts(config, flat(page('body').text()));
  if (facts === null) return [];
  const apy = re(config.apy);
  const offers: HtmlOffer[] = [];
  page('table')
    .filter((_, table) => flat(page(table).find('caption').text()).includes(config.caption))
    .find('tr')
    .each((_, row) => {
      const cells = page(row).find('th, td');
      const rate = apy.exec(flat(page(cells[config.columns.apy]).text()));
      const term = classifyTableRow({
        termText: flat(page(cells[config.columns.term]).text()),
        conditionText: '',
        asOfText: facts.asOf,
        opensOnlineNationwide: true,
      }).termMonths;
      if (rate === null || term === null) return;
      const band = facts.penalties.find((p) => p.maxTermMonths === null || term <= p.maxTermMonths);
      if (band === undefined) return;
      offers.push({
        name: config.name.replace('{term}', String(term)),
        category: config.category,
        termMonths: term,
        apyPercent: rate[1] ?? '',
        asOf: facts.asOf,
        minDollars: facts.minDollars,
        compounding: config.page.compounding.value,
        penaltyDays: band.days,
        quote: band.quote,
      });
    });
  return offers;
}

function eligibilityOf(config: HtmlTableConfig, text: string): Rule {
  const rule = config.page.eligibility;
  if (rule === undefined || !re(rule.pattern).test(text)) return UNSTATED_ELIGIBILITY;
  return { op: 'and', args: [], label: rule.label };
}

export function readTableConfig(config: HtmlTableConfig, html: string): BankExtract {
  const text = flat(cheerio.load(html)('body').text());
  return {
    products: extractTableOffers(config, html).map((offer) =>
      htmlOfferToProduct({
        offer,
        institutionId: config.institutionId,
        url: config.url,
        eligibility: eligibilityOf(config, text),
      }),
    ),
    extra: [],
  };
}
