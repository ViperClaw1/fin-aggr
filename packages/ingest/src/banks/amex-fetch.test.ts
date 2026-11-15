import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { PageRequest, ScrapeClient } from '../scrape/session';
import {
  AMEX_MAX_HEADER_SIZE,
  AMEX_ORIGIN,
  AMEX_REFERER,
  amexFetch,
  createAmexSession,
  fetchAmexRates,
} from './amex-fetch';
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

  it('builds the session with the project mailbox', () => {
    const client = createAmexSession('ops@fin-aggr.example', {
      now: () => '2026-11-15T08:00:00.000Z',
      sleep: () => Promise.resolve(),
      log: () => undefined,
    });
    expect(typeof client.get).toBe('function');
  });

  it('reads a response whose headers are larger than 16 KB', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('x-pad', 'a'.repeat(20_000));
      res.end('ok');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    expect(AMEX_MAX_HEADER_SIZE).toBe(65_536);
    try {
      const response = await amexFetch(`http://127.0.0.1:${String(address.port)}/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('ok');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      });
    }
  });
});
