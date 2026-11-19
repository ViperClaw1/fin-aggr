/**
 * Scrape limits from ADR-020 step 8.1.
 * The gap is ours. Crawl-delay in robots.txt does not change it.
 * Overnight is 22:00–06:00 in the bank's time zone. The bank job tries
 * 03:00–09:00 UTC so a runner that starts hours late is still inside that window.
 */

const PROJECT_URL = 'https://fin-aggr.vercel.app/bot';

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

export type ManualReason = 'robots' | 'captcha' | 'blocked' | 'headers_overflow' | 'adapter';

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

interface ZoneClock {
  year: number;
  month: number;
  day: number;
  hour: number;
}

function zonePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? '';
}

/** Wall-clock fields in the bank zone. Invalid clock or zone throws. */
function zoneClock(nowIso: string, timeZone: string): ZoneClock {
  const date = new Date(nowIso);
  if (Number.isNaN(date.getTime())) throw new Error('scrape time is invalid');
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
  } catch {
    throw new Error('scrape time zone is invalid');
  }
  const year = zonePart(parts, 'year');
  const month = zonePart(parts, 'month');
  const day = zonePart(parts, 'day');
  const hour = zonePart(parts, 'hour');
  if (
    !/^\d{4}$/.test(year) ||
    !/^\d{2}$/.test(month) ||
    !/^\d{2}$/.test(day) ||
    !/^\d{2}$/.test(hour)
  ) {
    throw new Error('scrape time zone is invalid');
  }
  return { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour) };
}

/** Local hour in `[22, 24)` or `[0, 6)`. */
export function isOvernight(nowIso: string, timeZone: string): boolean {
  const { hour } = zoneClock(nowIso, timeZone);
  return hour >= 22 || hour < 6;
}

/** Milliseconds between a UTC instant and the same numbers read as UTC in the zone. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const text = zonePart(parts, type);
    if (!/^\d+$/.test(text)) throw new Error('scrape time zone is invalid');
    return Number(text);
  };
  const wall = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  );
  return wall - instant.getTime();
}

function utcAtHour22(day: ZoneClock, timeZone: string): Date {
  return utcAtLocalHour(day, 22, timeZone);
}

function utcAtLocalHour(day: ZoneClock, hour: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(day.year, day.month - 1, day.day, hour));
  const corrected = new Date(guess.getTime() - zoneOffsetMs(guess, timeZone));
  return new Date(guess.getTime() - zoneOffsetMs(corrected, timeZone));
}

function dayBefore(year: number, month: number, day: number): ZoneClock {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: 22,
  };
}

/** Monday 00:00 UTC of the week that contains `nowIso`. The week is a UTC date, not a bank zone. */
export function utcWeekStart(nowIso: string): string {
  const parsed = new Date(nowIso);
  if (Number.isNaN(parsed.getTime())) throw new Error('week start time is invalid');
  const daysSinceMonday = (parsed.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate() - daysSinceMonday),
  ).toISOString();
}

/**
 * UTC instant when the current overnight window opened (22:00 in the bank zone).
 * Null when `nowIso` is outside 22:00–06:00 there. 06:00 local is already outside.
 */
export function overnightWindowStart(nowIso: string, timeZone: string): string | null {
  if (!isOvernight(nowIso, timeZone)) return null;
  const clock = zoneClock(nowIso, timeZone);
  const day = clock.hour >= 22 ? clock : dayBefore(clock.year, clock.month, clock.day);
  return utcAtHour22(day, timeZone).toISOString();
}

function hhmm(date: Date): string {
  return date.toISOString().slice(11, 16);
}

/**
 * The bank's window in UTC, `05:00–13:00Z`: the one open at `nowIso`, else tonight's.
 * Read from the zone's own clock, so a DST night is 7 or 9 hours.
 */
export function overnightWindowUtc(nowIso: string, timeZone: string): string {
  const open = overnightWindowStart(nowIso, timeZone);
  const clock = zoneClock(nowIso, timeZone);
  const start = open === null ? utcAtHour22(clock, timeZone) : new Date(open);
  const startDay = zoneClock(start.toISOString(), timeZone);
  const next = new Date(Date.UTC(startDay.year, startDay.month - 1, startDay.day + 1));
  const end = utcAtLocalHour(
    { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 6 },
    6,
    timeZone,
  );
  return `${hhmm(start)}–${hhmm(end)}Z`;
}

/**
 * UTC hours that touch 22:00–06:00 local in any of the zones, in January or July (DST-aware).
 * Dispatch slots are derived from this. Sorted, unique.
 */
export function overnightUtcHours(timeZones: readonly string[], year: number): number[] {
  const instants = ['01', '07'].flatMap((month) =>
    Array.from({ length: 24 }, (_, hour) => ({
      hour,
      at: `${String(year)}-${month}-15T${String(hour).padStart(2, '0')}:00:00.000Z`,
    })),
  );
  const hours = new Set(
    instants
      .filter(({ at }) => timeZones.some((zone) => isOvernight(at, zone)))
      .map(({ hour }) => hour),
  );
  return [...hours].sort((a, b) => a - b);
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

const BLOCKED_REQUEST_HEADER = new Set(['authorization', 'cookie', 'proxy-authorization']);

/**
 * Headers a bank adapter may add. The session still sets Accept and User-Agent.
 * A cookie or an authorization header is a credential, so the request is refused.
 */
export function scrapeRequestHeaders(
  headers: Readonly<Record<string, string>> | undefined,
): Record<string, string> | null {
  if (headers === undefined) return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    if (BLOCKED_REQUEST_HEADER.has(key)) return null;
    if (
      key === 'accept' ||
      key === 'user-agent' ||
      key === 'if-none-match' ||
      key === 'if-modified-since'
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}
