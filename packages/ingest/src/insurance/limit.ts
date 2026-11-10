import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Quotes taken from the saved eCFR renderer HTML for 12 CFR 330.1 and 745.1.
 * 12 CFR 328 is watch-only. This module does not change the fixture limit.
 */

const AMOUNT = /\$[0-9]{1,3}(?:,[0-9]{3})+/;

interface InsuranceLimitQuote {
  regulator: 'FDIC' | 'NCUA';
  section: string;
  sourceUrl: string;
  quote: string;
  amountText: string;
  verification: 'unverified';
}

const SOURCES = [
  {
    regulator: 'FDIC',
    file: 'section-330-1.html',
    sourceUrl:
      'https://www.ecfr.gov/current/title-12/chapter-III/subchapter-B/part-330/section-330.1',
  },
  {
    regulator: 'NCUA',
    file: 'section-745-1.html',
    sourceUrl:
      'https://www.ecfr.gov/current/title-12/chapter-VII/subchapter-A/part-745/subpart-A/section-745.1',
  },
] as const;

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\(\s*[a-z]\s*\)\s*/, '');
}

/** The definition sentence, including the dollar figure printed in that section. */
export function limitQuote(html: string): { section: string; quote: string; amountText: string } {
  const title = /data-title="([^"]+)"/.exec(html);
  const section = title?.[1];
  if (section === undefined || section === '') throw new Error('insurance section missing');
  const quote = plainText(html);
  const amount = AMOUNT.exec(quote);
  const amountText = amount?.[0];
  if (amountText === undefined) throw new Error('insurance quote has no amount');
  if (quote.length > 400) throw new Error('insurance quote too long');
  return { section, quote, amountText };
}

export function insuranceLimitQuotes(): InsuranceLimitQuote[] {
  return SOURCES.map((source) => {
    const html = readFileSync(join(import.meta.dirname, source.file), 'utf8');
    return {
      regulator: source.regulator,
      sourceUrl: source.sourceUrl,
      verification: 'unverified',
      ...limitQuote(html),
    };
  });
}
