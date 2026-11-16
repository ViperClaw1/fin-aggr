import * as cheerio from 'cheerio';
import { fingerprintOf, readFingerprint } from '../content-hash';
import type { ValidationReport } from '../validate';
import type { WatchSource } from '../watch';
import { amexCdSentences } from '../scrape/banks/normalize';

export const AMEX_CD_PAGE_URL =
  'https://www.americanexpress.com/en-us/banking/online-savings/cd-account/';

function flat(value: string): string {
  return value.replaceAll('\u00a0', ' ').replace(/\s+/g, ' ').trim();
}

/** One line per sentence. A sentence the page no longer contains is marked missing. */
export function amexCdWatchText(html: string): string {
  const text = flat(cheerio.load(html)('body').text());
  return amexCdSentences()
    .map((sentence) => {
      const line = flat(sentence);
      return text.includes(line) ? line : `missing: ${line}`;
    })
    .join('\n');
}

function emptyReport(): ValidationReport<string> {
  return { clean: [], suspicious: [], blocked: 'watch' };
}

/** Weekly fingerprint of the CD penalty, minimum, and compounding sentences. It does not publish. */
export function amexCdWatchSource(
  load: (signal: AbortSignal) => Promise<string>,
): WatchSource<string, string> {
  return {
    id: 'amex-cd-page',
    domain: 'bank_products',
    kind: 'scrape',
    mode: 'watch',
    fetch: async (ctx) => {
      const line = amexCdWatchText(await load(ctx.requestSignal()));
      return { ...fingerprintOf(line), body: line, requestCount: 1 };
    },
    parse: () => [],
    validate: emptyReport,
    changed: (previous, next) => readFingerprint(previous) !== next,
    persist: (_previous, next) => fingerprintOf(next),
    issueBody: (_previous, next) =>
      [`American Express CD page sentences changed.`, AMEX_CD_PAGE_URL, next].join('\n'),
  };
}
