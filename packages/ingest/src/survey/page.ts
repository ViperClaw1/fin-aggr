import * as cheerio from 'cheerio';

/**
 * Plan step 8.4 (ADR-026): what one institution's public pages show, read without publishing.
 * Pure functions over HTML; the runner fetches through `createScrapeSession`.
 */

interface Fingerprint {
  /** `<meta name="generator">`, as the site states it. */
  generator: string | null;
  /** Hosts of scripts served from another registrable domain, sorted. Vendors are not assumed. */
  scriptHosts: string[];
}

export interface HomeRead {
  /** Same-site link whose text or path names rates, best first. */
  ratesUrl: string | null;
  /** A PDF link that names Truth in Savings, a rate sheet or a deposit disclosure. */
  disclosurePdfUrl: string | null;
  fingerprint: Fingerprint;
}

const RATE_TEXT = /\b(rates?|apy|cd|certificates?|savings|money market)\b/i;
const RATE_PATH = /rate|cd|certificate|savings|deposit/i;
const PDF_TEXT = /truth.in.savings|rate.?sheet|deposit.*(disclosure|agreement)|fee schedule/i;
// No \b before the number: cheerio joins adjacent cells ("CD4.25%").
const PERCENT = /(?<![\d.])\d{1,2}\.\d{1,3}\s?%/;
const APY = /\bAPY\b|annual percentage yield/i;

/** Last two labels of a host. Good enough to tell third-party hosts apart; not a PSL lookup. */
export function siteOf(host: string): string {
  // ponytail: two-label site, wrong for co.uk-style suffixes; US bank hosts do not use them
  return host.toLowerCase().split('.').slice(-2).join('.');
}

function absolute(href: string | undefined, base: URL): URL | null {
  if (href === undefined || href.trim() === '' || href.startsWith('#')) return null;
  try {
    const url = new URL(href, base);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function rateScore(text: string, url: URL): number {
  const label = text.trim();
  let score = 0;
  if (/\brates?\b/i.test(label)) score += 3;
  if (RATE_TEXT.test(label)) score += 2;
  if (RATE_PATH.test(url.pathname)) score += 1;
  return score;
}

export function readHome(html: string, pageUrl: string): HomeRead {
  const page = cheerio.load(html);
  const base = new URL(pageUrl);
  const site = siteOf(base.hostname);
  const best: { url: string | null; score: number } = { url: null, score: 2 };
  const found: { pdf: string | null } = { pdf: null };
  page('a[href]').each((_, element) => {
    const url = absolute(page(element).attr('href'), base);
    if (url === null) return;
    const text = page(element).text();
    if (url.pathname.toLowerCase().endsWith('.pdf')) {
      if (found.pdf === null && PDF_TEXT.test(`${text} ${url.pathname}`)) found.pdf = url.href;
      return;
    }
    if (siteOf(url.hostname) !== site) return;
    const score = rateScore(text, url);
    if (score > best.score) Object.assign(best, { url: url.href, score });
  });
  return {
    ratesUrl: best.url,
    disclosurePdfUrl: found.pdf,
    fingerprint: fingerprintOf(page, site, base),
  };
}

function fingerprintOf(page: cheerio.CheerioAPI, site: string, base: URL): Fingerprint {
  const generator = page('meta[name="generator" i]').attr('content')?.trim() ?? '';
  const hosts = new Set<string>();
  page('script[src]').each((_, element) => {
    const url = absolute(page(element).attr('src'), base);
    if (url !== null && siteOf(url.hostname) !== site) hosts.add(url.hostname.toLowerCase());
  });
  return { generator: generator === '' ? null : generator, scriptHosts: [...hosts].sort() };
}

/** Rates in the served HTML: a percent and the word APY in text a browser shows without scripts. */
export function hasRatesWithoutJs(html: string): boolean {
  const page = cheerio.load(html);
  page('script, style, noscript, template').remove();
  const text = page('body').text().replace(/\s+/g, ' ');
  return PERCENT.test(text) && APY.test(text);
}
