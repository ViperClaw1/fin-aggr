import { describe, expect, it } from 'vitest';
import type { PageRequest, ScrapeClient } from '../scrape/session';
import { AMEX_ORIGIN, AMEX_REFERER, fetchAmexRates } from './amex-fetch';
import { AMEX_RATES_URL, AMEX_SOURCE_ID, AMEX_TIME_ZONE } from './amex';

describe('American Express fetch', () => {
  it('asks the scrape session for the rates URL once', async () => {
    const calls: PageRequest[] = [];
    const client: ScrapeClient = {
      get: (target) => {
        calls.push(target);
        return Promise.resolve({ kind: 'outside_window' });
      },
      flushLoad() {
        return undefined;
      },
      quote: (text) => text,
    };
    await expect(fetchAmexRates(client)).resolves.toEqual({ kind: 'outside_window' });
    expect(calls).toEqual([
      {
        sourceId: AMEX_SOURCE_ID,
        url: AMEX_RATES_URL,
        timeZone: AMEX_TIME_ZONE,
        excluded: false,
        headers: { origin: AMEX_ORIGIN, referer: AMEX_REFERER },
      },
    ]);
  });
});
