import { rateFromPercent } from '@fa/contracts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decidePublish } from '../pipeline';
import { checkParYieldShape } from './live';
import {
  fetchParYields,
  parseParYields,
  parYieldHeaderProblems,
  parYieldUrl,
  validateParYields,
  type ParYieldPoint,
  type ParYieldRaw,
} from './par-yield';

const RETRIEVED_AT = '2026-11-12T12:00:00.000Z';
const AS_OF = '2026-11-12';

const recorded = readFileSync(join(import.meta.dirname, 'par-yield.snapshot.csv'), 'utf8');

function raw(body: string): ParYieldRaw {
  return { retrievedAt: RETRIEVED_AT, url: parYieldUrl(2026), body };
}

function parsed(): ParYieldPoint[] {
  return parseParYields(raw(recorded));
}

describe('Treasury par yield', () => {
  it('maps the recorded curve without calling the network', () => {
    expect(parYieldHeaderProblems(recorded)).toEqual([]);
    const rows = parsed();
    expect(rows).toHaveLength(28);
    expect(rows.find((row) => row.date === '2026-11-10' && row.tenor === '1M')?.rate).toBe(
      '0.0405',
    );
    expect(rows.find((row) => row.date === '2026-11-10' && row.tenor === '10Y')?.rate).toBe(
      rateFromPercent('4.98'),
    );
    const report = validateParYields(rows, [], AS_OF);
    expect(report.blocked).toBeNull();
    expect(report.suspicious).toEqual([]);
    expect(report.clean).toHaveLength(28);
  });

  it('holds a missing tenor, a rate above 20%, and a date after the fetch', () => {
    const missing = recorded.replace('4.05', 'N/A');
    expect(validateParYields(parseParYields(raw(missing)), [], AS_OF).blocked).toBe('tenor');

    const high = recorded.replace('4.05', '21.00');
    expect(validateParYields(parseParYields(raw(high)), [], AS_OF).blocked).toBe('rate bounds');

    const future = recorded.replace('11/10/2026', '11/13/2026');
    expect(validateParYields(parseParYields(raw(future)), [], AS_OF).blocked).toBe('future');
    expect(() => parseParYields(raw(recorded.replace('Date', 'Day')))).toThrow(
      'treasury par yield header',
    );
  });

  it('queues only a move of the newest curve, and an official batch then does not publish', () => {
    const rows = parsed().map((row) =>
      row.date === '2026-11-10' && row.tenor === '10Y'
        ? { ...row, rate: rateFromPercent('5.50') }
        : row,
    );
    const stored: ParYieldPoint[] = parsed().filter((row) => row.date === '2026-11-10');
    const revised = validateParYields(rows, stored, AS_OF);
    expect(revised.suspicious).toEqual([{ key: '2026-11-10 10Y', reasons: ['rate move'] }]);
    expect(
      decidePublish({
        kind: 'official_api',
        clean: revised.clean,
        suspicious: revised.suspicious,
        blocked: revised.blocked,
      }).publish,
    ).toBeNull();

    const spiked = `${recorded}11/07/2026,3.00,3.00,3.00,3.00,3.00,3.00,3.00,3.00,3.00,3.00,3.00,3.00,3.00,3.00\n`;
    expect(validateParYields(parseParYields(raw(spiked)), [], AS_OF).suspicious).toEqual([]);
  });

  it('requests the year of the fetch and stores the CSV text', async () => {
    const seen: { url: string; agent: string | null }[] = [];
    const snapshot = await fetchParYields({
      retrievedAt: RETRIEVED_AT,
      signal: AbortSignal.timeout(30_000),
      fetchImpl: (input, init) => {
        if (typeof input !== 'string') throw new Error('treasury par yield url');
        const headers = new Headers(init?.headers);
        seen.push({ url: input, agent: headers.get('user-agent') });
        return Promise.resolve(new Response(recorded, { status: 200 }));
      },
    });
    expect(seen).toEqual([{ url: parYieldUrl(2026), agent: 'FA (+https://fin-aggr.vercel.app)' }]);
    expect(snapshot.body.body).toBe(recorded);
    expect(snapshot.sha256).toMatch(/^[0-9a-f]{64}$/);
    const later = await fetchParYields({
      retrievedAt: '2026-11-13T12:00:00.000Z',
      signal: AbortSignal.timeout(30_000),
      fetchImpl: () => Promise.resolve(new Response(recorded, { status: 200 })),
    });
    expect(later.sha256).toBe(snapshot.sha256);
    expect(later.body.retrievedAt).not.toBe(snapshot.body.retrievedAt);
  });

  it('accepts the recorded header from the nightly shape check', async () => {
    const line = await checkParYieldShape(() => Promise.resolve(new Response(recorded)));
    expect(line).toBe('treasury par yield shape ok');
  });
});
