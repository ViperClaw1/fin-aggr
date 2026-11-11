/**
 * Scrape limits from ADR-020 step 8.1.
 * The gap is ours. Crawl-delay in robots.txt does not change it.
 * Overnight is 22:00–06:00 in the bank's time zone, so the 08:00 UTC job
 * falls inside it for US time zones from Hawaii through Eastern.
 */

const PROJECT_URL = 'https://fin-aggr.vercel.app';

/** One request per registrable domain. The long end of the 5–10s range, fixed so a run does not roll a die. */
export const SCRAPE_GAP_MS = 10_000;

/** A fact quote stays inside the `Provenance` limit. */
const QUOTE_MAX = 400;

/** Page and PDF bodies go to this private bucket and nowhere else. */
export const RAW_BUCKET = 'raw';

const OPT_OUT_WINDOW_MS = 24 * 60 * 60 * 1000;

const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/;
const MAILBOX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const MULTI_PART_SUFFIX = new Set(['co.uk', 'org.uk', 'ac.uk', 'com.au', 'co.nz', 'com.br']);

const PRIVATE_SEGMENT = new Set([
  'account',
  'auth',
  'log-in',
  'login',
  'oauth',
  'passwd',
  'password',
  'session',
  'sign-in',
  'sign-up',
  'signin',
  'signup',
  'sso',
]);

const PRIVATE_QUERY = new Set(['passwd', 'password', 'session', 'token']);

const CAPTCHA =
  /recaptcha|hcaptcha|g-recaptcha|h-captcha|\/cdn-cgi\/challenge|cf-challenge|cf-mitigated/i;

export type ManualReason = 'robots' | 'captcha' | 'blocked';

export interface PublicPage {
  href: string;
  originHost: string;
  domain: string;
}

/** `bank:` plus a `sources.id`. Opt-out and the rate runner only accept this shape. */
export function isBankSourceId(id: string): boolean {
  return id.startsWith('bank:') && SOURCE_ID.test(id);
}

/** The project mailbox. Empty or a non-address refuses the run. The value is not written to our logs. */
function requireScrapeMailbox(value: string | undefined): string {
  const mailbox = value?.trim() ?? '';
  if (!MAILBOX.test(mailbox)) {
    throw new Error('Scrape mailbox is missing. Set FA_SCRAPE_MAILBOX.');
  }
  return mailbox;
}

/** Names the project, its URL, and the project mailbox (ADR-020). */
export function scrapeUserAgent(mailbox: string | undefined): string {
  return `FA (+${PROJECT_URL}; ${requireScrapeMailbox(mailbox)})`;
}

/** eTLD+1 for the rate limit. `www` is not part of it. A host we cannot classify is refused. */
function registrableDomain(hostname: string): string {
  let host = hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  const labels = host.split('.');
  const named = labels.every(
    (label) => /^[a-z0-9-]+$/.test(label) && !label.startsWith('-') && !label.endsWith('-'),
  );
  if (!named || labels.length < 2 || labels.every((label) => /^\d+$/.test(label))) {
    throw new Error('scrape host is not a public domain');
  }
  const tail = labels.slice(-2).join('.');
  if (labels.length >= 3 && MULTI_PART_SUFFIX.has(tail)) return labels.slice(-3).join('.');
  return tail;
}

/** https, no credentials, no login path. Anything else is not a page we fetch. */
export function assertPublicPage(input: string): PublicPage {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('scrape url is not public');
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') {
    throw new Error('scrape url is not public');
  }
  let domain: string;
  try {
    domain = registrableDomain(url.hostname);
  } catch {
    throw new Error('scrape url is not public');
  }
  const segments = url.pathname.split('/').filter((part) => part !== '');
  const privatePath = segments.some((part) => PRIVATE_SEGMENT.has(part.toLowerCase()));
  const privateQuery = [...url.searchParams.keys()].some((key) =>
    PRIVATE_QUERY.has(key.toLowerCase()),
  );
  if (privatePath || privateQuery) throw new Error('scrape url is not public');
  url.hash = '';
  return { href: url.href, originHost: url.hostname.toLowerCase(), domain };
}

/** Local hour in `[22, 24)` or `[0, 6)`. */
export function isOvernight(nowIso: string, timeZone: string): boolean {
  const date = new Date(nowIso);
  if (Number.isNaN(date.getTime())) throw new Error('scrape time is invalid');
  let hourText = '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    hourText = parts.find((part) => part.type === 'hour')?.value ?? '';
  } catch {
    throw new Error('scrape time zone is invalid');
  }
  if (!/^\d{2}$/.test(hourText)) throw new Error('scrape time zone is invalid');
  const hour = Number(hourText);
  return hour >= 22 || hour < 6;
}

/** Applied more than 24 hours after the bank asked. Earlier than the request is an error. */
export function optOutLate(requestedAt: string, appliedAt: string): boolean {
  const requested = Date.parse(requestedAt);
  const applied = Date.parse(appliedAt);
  if (Number.isNaN(requested) || Number.isNaN(applied)) throw new Error('opt-out time is invalid');
  if (applied < requested) throw new Error('opt-out applied before it was requested');
  return applied - requested > OPT_OUT_WINDOW_MS;
}

/** One sentence when it fits, otherwise a short clip. Never longer than the fact quote. */
export function shortQuote(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat === '') throw new Error('scrape quote is empty');
  if (flat.length <= QUOTE_MAX) return flat;
  const slice = flat.slice(0, QUOTE_MAX);
  const sentence = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('! '),
  );
  if (sentence >= 40) return slice.slice(0, sentence + 1);
  const space = slice.lastIndexOf(' ');
  return (space >= 40 ? slice.slice(0, space) : slice).trimEnd();
}

/** Captcha wins over a bare block status. A normal 200 or 404 is neither. */
export function blockReason(
  status: number,
  headerText: string,
  sample: string,
): ManualReason | null {
  if (CAPTCHA.test(headerText) || CAPTCHA.test(sample)) return 'captcha';
  if (status === 401 || status === 403 || status === 429) return 'blocked';
  return null;
}

export function formatLoad(domain: string, requests: number, bytes: number): string {
  return `load ${domain} requests=${String(requests)} bytes=${String(bytes)}`;
}

export function formatManual(sourceId: string, reason: ManualReason): string {
  return `source ${sourceId} manual ${reason}`;
}

export function formatExcluded(sourceId: string, late: boolean): string {
  return late ? `source ${sourceId} excluded late` : `source ${sourceId} excluded`;
}
