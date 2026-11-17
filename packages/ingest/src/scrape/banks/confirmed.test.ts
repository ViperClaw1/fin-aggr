import { describe, expect, it } from 'vitest';
import type { Product } from '@fa/contracts';
import { reviewedProductIds } from '../../postgres/bank-products';
import type { ScrapeClient } from '../session';
import { readAlly } from './57803';
import { reviewBankProducts } from './review';
import { runBankPage, type BankPorts } from './run';

const HTML = `<section><h3>Savings</h3><p>Access your money at any time.</p><p>3.2% correct as of 11/12/26</p></section>`;
const NIGHT = '2026-11-11T08:00:00.000Z';
const SOURCE = 'bank:fdic:57803';
const savings = readAlly(HTML).products;

const client: ScrapeClient = {
  get: () =>
    Promise.resolve({
      kind: 'ok',
      url: 'https://www.ally.com/bank/view-rates/',
      body: new TextEncoder().encode(HTML),
      status: 200 as const,
    }),
  flushLoad: () => undefined,
  quote: (text) => text,
};

describe('confirmed bank products', () => {
  it('publishes a confirmed product of a confirmed bank with no previous version', () => {
    const report = reviewBankProducts({
      rows: savings,
      previous: [],
      confirmed: true,
      confirmedIds: savings.map((row) => row.id),
      retrievedDay: '2026-11-16',
    });
    expect(report.clean.map((row) => row.id)).toEqual(['fdic-57803-savings']);
    expect(report.suspicious).toEqual([]);
    expect(report.blocked).toBeNull();
  });

  it('holds an unconfirmed product of a confirmed bank as a first connection', () => {
    const report = reviewBankProducts({
      rows: savings,
      previous: [],
      confirmed: true,
      confirmedIds: ['fdic-57803-other'],
      retrievedDay: '2026-11-16',
    });
    expect(report.clean).toEqual([]);
    expect(report.suspicious).toEqual([
      { key: 'fdic-57803-savings', reasons: ['first_connection'] },
    ]);
  });

  it('publishes the products of an approved review row on the next run', async () => {
    const confirmed: string[] = [];
    const last: { published: readonly Product[] | null; queued: string | null } = {
      published: null,
      queued: null,
    };
    const ports: BankPorts = {
      confirmation: () => Promise.resolve({ confirmed: true, verifiedAt: '2026-11-15' }),
      previous: () => Promise.resolve([]),
      confirmedIds: () => Promise.resolve([...confirmed]),
      saveSnapshot: () => Promise.resolve(9),
      commit: (input) => {
        last.published = input.publish;
        last.queued = input.queue?.reason ?? null;
        return Promise.resolve({ versionId: input.publish === null ? null : 3, queueId: null });
      },
      markManual: () => Promise.resolve(),
      requestedSince: () => Promise.resolve(false),
      finishJob: () => Promise.resolve(),
    };
    const run = () =>
      runBankPage({
        client,
        request: {
          sourceId: SOURCE,
          url: 'https://www.ally.com/',
          timeZone: 'America/Denver',
          excluded: false,
        },
        institutionId: 'fdic:57803',
        retrievedDay: '2026-11-16',
        read: readAlly,
        ports,
        log: () => undefined,
        now: () => NIGHT,
      });

    await run();
    expect(last.published).toBeNull();
    expect(last.queued).toBe('fdic-57803-savings: first_connection');

    confirmed.push(...reviewedProductIds(SOURCE, last.queued ?? ''));
    await run();
    expect(last.published?.map((row) => row.id)).toEqual(['fdic-57803-savings']);
    expect(last.queued).toBeNull();
  });
});
