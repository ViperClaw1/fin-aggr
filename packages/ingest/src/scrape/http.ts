import { Agent, fetch as undiciFetch } from 'undici';

/**
 * Node's fetch rejects response headers above 16 KB. American Express pages
 * send about 32 KB, so every scrape request allows 64 KB (ADR-020).
 */
export const SCRAPE_MAX_HEADER_SIZE = 65_536;

const agent = new Agent({ maxHeaderSize: SCRAPE_MAX_HEADER_SIZE });

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function scrapeInit(init: RequestInit | undefined): Parameters<typeof undiciFetch>[1] {
  return {
    dispatcher: agent,
    method: init?.method,
    headers: init?.headers,
    redirect: init?.redirect,
    cache: init?.cache,
    signal: init?.signal ?? undefined,
  } as Parameters<typeof undiciFetch>[1];
}

/** The one transport of `createScrapeSession`. Robots, gap, window, and User-Agent stay in the session. */
export const scrapeFetch: typeof fetch = (input, init) =>
  undiciFetch(requestUrl(input), scrapeInit(init));
