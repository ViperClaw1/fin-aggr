import { Agent, fetch as undiciFetch } from 'undici';
import {
  createScrapeSession,
  type PageResult,
  type ScrapeClient,
  type ScrapeDeps,
} from '../scrape/session';
import { AMEX_RATES_URL, AMEX_SOURCE_ID, AMEX_TIME_ZONE } from './amex';

/**
 * Node's fetch rejects response headers above 16 KB. This host can send more
 * than that, so the Amex client allows 64 KB. The sample read on 2026-11-15
 * was under 16 KB; the limit is what keeps a larger block from failing the run.
 */
export const AMEX_MAX_HEADER_SIZE = 65_536;

/** Public page whose script calls the rates URL. No cookie and no authorization. */
export const AMEX_ORIGIN = 'https://www.americanexpress.com';
export const AMEX_REFERER = 'https://www.americanexpress.com/en-us/banking/online-savings/cd/';

const amexAgent = new Agent({ maxHeaderSize: AMEX_MAX_HEADER_SIZE });

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function amexInit(init: RequestInit | undefined): Parameters<typeof undiciFetch>[1] {
  return {
    dispatcher: amexAgent,
    method: init?.method,
    headers: init?.headers,
    redirect: init?.redirect,
    cache: init?.cache,
    signal: init?.signal ?? undefined,
  } as Parameters<typeof undiciFetch>[1];
}

/** One undici agent for this host. The scrape session still owns robots, gap, and User-Agent. */
export const amexFetch: typeof fetch = (input, init) =>
  undiciFetch(requestUrl(input), amexInit(init));

export function createAmexSession(
  mailbox: string | undefined,
  deps: Omit<ScrapeDeps, 'fetch'>,
): ScrapeClient {
  return createScrapeSession(mailbox, { ...deps, fetch: amexFetch });
}

/** One `get` per run. The session reads robots.txt of this host before the JSON. */
export function fetchAmexRates(client: ScrapeClient): Promise<PageResult> {
  return client.get({
    sourceId: AMEX_SOURCE_ID,
    url: AMEX_RATES_URL,
    timeZone: AMEX_TIME_ZONE,
    excluded: false,
    headers: { origin: AMEX_ORIGIN, referer: AMEX_REFERER },
  });
}
