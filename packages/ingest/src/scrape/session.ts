import robotsParser from 'robots-parser';
import {
  assertPublicPage,
  blockReason,
  formatExcluded,
  formatLoad,
  formatManual,
  isOvernight,
  optOutLate,
  SCRAPE_GAP_MS,
  scrapeUserAgent,
  shortQuote,
  type ManualReason,
  type PublicPage,
} from './rules';

export interface ScrapeDeps {
  fetch: typeof fetch;
  now(): string;
  sleep(ms: number): Promise<void>;
  log(line: string): void;
  onManual?(sourceId: string, reason: ManualReason): Promise<void>;
}

export interface PageRequest {
  sourceId: string;
  url: string;
  timeZone: string;
  excluded: boolean;
  optOutRequestedAt?: string;
  optOutAppliedAt?: string;
}

type PageResult =
  | { kind: 'ok'; url: string; body: Uint8Array; status: 200 }
  | { kind: 'not_modified'; url: string }
  | { kind: 'missing' }
  | { kind: 'manual'; reason: ManualReason }
  | { kind: 'outside_window' }
  | { kind: 'excluded'; late: boolean };

export interface ScrapeClient {
  get(target: PageRequest): Promise<PageResult>;
  /** One line per registrable domain this session contacted. */
  flushLoad(): void;
  /** Clip a scraped fact to a short quote before it is stored. */
  quote(text: string): string;
}

interface Fetched {
  status: number;
  headers: Headers;
  body: Uint8Array;
}

interface Load {
  requests: number;
  bytes: number;
}

interface Validators {
  etag: string | null;
  modified: string | null;
}

type RobotsState =
  { kind: 'rules'; allows(url: string): boolean } | { kind: 'manual'; result: PageResult };

interface Session {
  userAgent: string;
  deps: ScrapeDeps;
  lastSent: Map<string, string>;
  loads: Map<string, Load>;
  robots: Map<string, RobotsState>;
  validators: Map<string, Validators>;
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);

/**
 * The only fetch path for a bank page. One session for the whole rate run:
 * robots.txt once per host, ten seconds between requests to one registrable domain,
 * conditional headers, and a stop on captcha or a block. No cookies, no second try
 * that changes address.
 */
export function createScrapeSession(mailbox: string | undefined, deps: ScrapeDeps): ScrapeClient {
  const session: Session = {
    userAgent: scrapeUserAgent(mailbox),
    deps,
    lastSent: new Map(),
    loads: new Map(),
    robots: new Map(),
    validators: new Map(),
  };
  return {
    get: (target) => readPage(session, target),
    flushLoad() {
      for (const [domain, load] of session.loads) {
        deps.log(formatLoad(domain, load.requests, load.bytes));
      }
    },
    quote: (text) => shortQuote(text),
  };
}

async function readPage(session: Session, target: PageRequest): Promise<PageResult> {
  if (target.excluded) return excluded(session, target);
  let page: PublicPage;
  try {
    page = assertPublicPage(target.url);
  } catch {
    return stop(session, target.sourceId, 'blocked');
  }
  if (!isOvernight(session.deps.now(), target.timeZone)) return { kind: 'outside_window' };
  return follow(session, target.sourceId, page, 0);
}

function excluded(session: Session, target: PageRequest): PageResult {
  const late =
    target.optOutRequestedAt !== undefined &&
    target.optOutAppliedAt !== undefined &&
    optOutLate(target.optOutRequestedAt, target.optOutAppliedAt);
  session.deps.log(formatExcluded(target.sourceId, late));
  return { kind: 'excluded', late };
}

async function stop(session: Session, sourceId: string, reason: ManualReason): Promise<PageResult> {
  session.deps.log(formatManual(sourceId, reason));
  if (session.deps.onManual !== undefined) await session.deps.onManual(sourceId, reason);
  return { kind: 'manual', reason };
}

async function pause(session: Session, domain: string): Promise<void> {
  const last = session.lastSent.get(domain);
  if (last !== undefined) {
    const wait = Date.parse(last) + SCRAPE_GAP_MS - Date.parse(session.deps.now());
    if (wait > 0) await session.deps.sleep(wait);
  }
  const sent = session.deps.now();
  if (last !== undefined && Date.parse(sent) < Date.parse(last) + SCRAPE_GAP_MS) {
    throw new Error('scrape clock did not advance');
  }
  session.lastSent.set(domain, sent);
}

interface Outbound {
  domain: string;
  url: string;
  extra: Record<string, string>;
  accept: string;
}

async function send(session: Session, input: Outbound): Promise<Fetched> {
  await pause(session, input.domain);
  const response = await session.deps.fetch(input.url, {
    method: 'GET',
    redirect: 'manual',
    cache: 'no-store',
    headers: { ...input.extra, accept: input.accept, 'user-agent': session.userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  const body = new Uint8Array(await response.arrayBuffer());
  const tally = session.loads.get(input.domain) ?? { requests: 0, bytes: 0 };
  session.loads.set(input.domain, {
    requests: tally.requests + 1,
    bytes: tally.bytes + body.byteLength,
  });
  return { status: response.status, headers: response.headers, body };
}

async function robotsFor(
  session: Session,
  sourceId: string,
  page: PublicPage,
): Promise<RobotsState> {
  const cached = session.robots.get(page.originHost);
  if (cached !== undefined) return cached;
  const robotsUrl = `https://${page.originHost}/robots.txt`;
  const fetched = await send(session, {
    domain: page.domain,
    url: robotsUrl,
    extra: {},
    accept: 'text/plain',
  });
  const reason = blockReason(fetched.status, headerText(fetched.headers), sampleOf(fetched.body));
  if (reason !== null) {
    const state: RobotsState = { kind: 'manual', result: await stop(session, sourceId, reason) };
    session.robots.set(page.originHost, state);
    return state;
  }
  if (fetched.status !== 200 && fetched.status !== 404 && fetched.status !== 410) {
    throw new Error(`scrape http ${String(fetched.status)}`);
  }
  const text = fetched.status === 200 ? new TextDecoder().decode(fetched.body) : '';
  const parsed = robotsParser(robotsUrl, text);
  const state: RobotsState = {
    kind: 'rules',
    allows: (url) => parsed.isAllowed(url, session.userAgent) !== false,
  };
  session.robots.set(page.originHost, state);
  return state;
}

function conditional(session: Session, url: string): Record<string, string> {
  const previous = session.validators.get(url);
  if (previous === undefined) return {};
  const headers: Record<string, string> = {};
  if (previous.etag !== null) headers['if-none-match'] = previous.etag;
  if (previous.modified !== null) headers['if-modified-since'] = previous.modified;
  return headers;
}

function remember(session: Session, url: string, headers: Headers): void {
  const etag = headers.get('etag');
  const modified = headers.get('last-modified');
  if (etag === null && modified === null) return;
  const previous = session.validators.get(url);
  session.validators.set(url, {
    etag: etag ?? previous?.etag ?? null,
    modified: modified ?? previous?.modified ?? null,
  });
}

async function interpret(
  session: Session,
  sourceId: string,
  url: string,
  fetched: Fetched,
): Promise<PageResult> {
  const reason = blockReason(fetched.status, headerText(fetched.headers), sampleOf(fetched.body));
  if (reason !== null) return stop(session, sourceId, reason);
  if (fetched.status === 304) return { kind: 'not_modified', url };
  if (fetched.status === 200) {
    remember(session, url, fetched.headers);
    return { kind: 'ok', url, body: fetched.body, status: 200 };
  }
  if (fetched.status === 404) return { kind: 'missing' };
  throw new Error(`scrape http ${String(fetched.status)}`);
}

async function follow(
  session: Session,
  sourceId: string,
  page: PublicPage,
  hops: number,
): Promise<PageResult> {
  if (hops === 5) return stop(session, sourceId, 'blocked');
  const gate = await robotsFor(session, sourceId, page);
  if (gate.kind === 'manual') return gate.result;
  if (!gate.allows(page.href)) return stop(session, sourceId, 'robots');
  const fetched = await send(session, {
    domain: page.domain,
    url: page.href,
    extra: conditional(session, page.href),
    accept: 'text/html, application/json',
  });
  if (!REDIRECT.has(fetched.status)) return interpret(session, sourceId, page.href, fetched);
  const location = fetched.headers.get('location');
  if (location === null || location === '') return stop(session, sourceId, 'blocked');
  try {
    const next = assertPublicPage(new URL(location, page.href).href);
    return await follow(session, sourceId, next, hops + 1);
  } catch {
    return stop(session, sourceId, 'blocked');
  }
}

function sampleOf(body: Uint8Array): string {
  return new TextDecoder().decode(body.subarray(0, 8192));
}

function headerText(headers: Headers): string {
  return [...headers.entries()].map(([name, value]) => `${name}: ${value}`).join('\n');
}
