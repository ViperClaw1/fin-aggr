import type { PageResult, ScrapeClient } from '../scrape/session';
import { AMEX_RATES_URL, AMEX_SOURCE_ID, AMEX_TIME_ZONE } from './amex';

/** Public page whose script calls the rates URL. No cookie and no authorization. */
export const AMEX_ORIGIN = 'https://www.americanexpress.com';
export const AMEX_REFERER = 'https://www.americanexpress.com/en-us/banking/online-savings/cd/';

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
