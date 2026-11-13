import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import { commitFinancials, previousFinancials } from '../postgres/financials';
import { checkFinancialsShape, fetchFdicFinancials } from './financials-fetch';
import {
  financialFieldProblems,
  financialsProbeUrl,
  parseFdicFinancials,
  validateFdicFinancials,
  type CallReport,
  type FdicFinancialsRaw,
} from './financials';

const RETRIEVED_AT = '2026-11-12T12:00:00.000Z';
const recorded = readFileSync(join(import.meta.dirname, 'financials.snapshot.json'), 'utf8');
const ids = new Set(['fdic:3510', 'fdic:628']);

function raw(): FdicFinancialsRaw {
  return {
    retrievedAt: RETRIEVED_AT,
    responses: [
      { url: 'https://api.fdic.gov/banks/financials?filters=REPDTE:20260630', body: recorded },
    ],
  };
}

describe('FDIC financials', () => {
  it('maps the recorded quarter without a network call', () => {
    expect(financialFieldProblems(recorded)).toEqual([]);
    const rows = parseFdicFinancials(raw(), ids);
    expect(rows.map((row) => row.report.institutionId)).toEqual(['fdic:3510', 'fdic:628']);
    const first = rows[0];
    expect(first?.report.asOf).toBe('2026-06-30');
    expect(first?.report.totalAssetsUsdThousands).toBe(2654645000);
    expect(first?.depositsUsdThousands).toBe(2121804000);
    expect(first?.report.metrics.tier1LeverageRatio?.value.value).toBe(7.1144);
    expect(first?.report.metrics.returnOnAssets?.value.value).toBe(1.1261);
    expect(first?.report.metrics.liquidAssetsToAssets).toBeUndefined();
    expect(first?.report.balanceSheetMix).toEqual([]);
    expect(first?.report.metrics.tier1LeverageRatio?.value.percentile).toBe(50);
  });

  it('drops a bank outside the directory and reviews a quarterly jump', () => {
    const rows = parseFdicFinancials(raw(), new Set(['fdic:3510']));
    expect(rows).toHaveLength(1);
    const both = parseFdicFinancials(raw(), ids);
    const jumping = both[0];
    const stable = both[1];
    if (jumping === undefined || stable === undefined) throw new Error('expected a call report');
    const previous: CallReport = {
      depositsUsdThousands: jumping.depositsUsdThousands,
      report: {
        ...jumping.report,
        metrics: {
          ...jumping.report.metrics,
          tier1LeverageRatio: {
            value: { value: 4, marketMedian: 4, marketMean: 4, percentile: 50, outlier: null },
            provenance: jumping.report.provenance,
          },
        },
      },
    };
    const reviewed = validateFdicFinancials(both, [previous, stable], '2026-11-12');
    expect(reviewed.blocked).toBeNull();
    expect(reviewed.suspicious).toEqual([]);
    expect(reviewed.clean[0]?.report.metrics.tier1LeverageRatio?.value.outlier).toBe('jump');
    expect(validateFdicFinancials([], [], '2026-11-12').blocked).toBe('empty');
  });

  it('publishes a ratio above the band and drops it from the market median', () => {
    const rows = parseFdicFinancials(raw(), ids);
    const peer = rows[1];
    const high = rows[0];
    if (peer === undefined || high === undefined) throw new Error('expected a call report');
    const fact = high.report.metrics.totalRiskBasedCapitalRatio;
    if (fact === undefined) throw new Error('expected a capital ratio');
    const specialist: CallReport = {
      ...high,
      report: {
        ...high.report,
        metrics: {
          ...high.report.metrics,
          totalRiskBasedCapitalRatio: {
            ...fact,
            value: { ...fact.value, value: 400 },
          },
        },
      },
    };
    const reviewed = validateFdicFinancials(
      [specialist, ...Array.from({ length: 20 }, () => peer)],
      [],
      '2026-11-12',
    );
    expect(reviewed.blocked).toBeNull();
    const flagged = reviewed.clean[0]?.report.metrics.totalRiskBasedCapitalRatio?.value;
    expect(flagged?.outlier).toBe('band');
    expect(flagged?.percentile).toBeNull();
    expect(flagged?.marketMedian).toBe(peer.report.metrics.totalRiskBasedCapitalRatio?.value.value);
    expect(validateFdicFinancials([specialist, peer], [], '2026-11-12').blocked).toBe(
      'outlier_share',
    );
    const broken: CallReport = {
      ...specialist,
      report: {
        ...specialist.report,
        metrics: {
          totalRiskBasedCapitalRatio: { ...fact, value: { ...fact.value, value: 20000 } },
        },
      },
    };
    expect(validateFdicFinancials([broken], [], '2026-11-12').blocked).toBe('impossible');
  });

  it('probes one certificate and pages inside the budget', async () => {
    const budget = AbortSignal.timeout(5_000);
    const urls: string[] = [];
    const snapshot = await fetchFdicFinancials({
      retrievedAt: RETRIEVED_AT,
      signal: budget,
      requestSignal: () => budget,
      pageSize: 1,
      pause: () => Promise.resolve(),
      fetchImpl: (input) => {
        if (typeof input !== 'string') throw new Error('fdic financials url');
        urls.push(input);
        const body = urls.length === 1 ? recorded : oneBank(urls.length === 2 ? 3510 : 628);
        return Promise.resolve(new Response(body, { status: 200 }));
      },
    });
    expect(urls[0]).toBe(financialsProbeUrl());
    expect(urls[0]).toContain('filters=CERT%3A3510');
    expect(urls[0]).toContain('fields=REPDTE');
    expect(urls[0]).toContain('limit=1');
    expect(urls[0]).not.toContain('ASSET');
    expect(urls[1]).toContain('limit=1');
    expect(urls[2]).toContain('offset=1');
    expect(urls).toHaveLength(3);
    expect(snapshot.requestCount).toBe(3);
    expect(budget.aborted).toBe(false);
    const line = await checkFinancialsShape(() => Promise.resolve(new Response(recorded)));
    expect(line).toBe('fdic financials shape ok');
  });

  it('retries one hung page and does not restart the probe', async () => {
    const urls: string[] = [];
    let hung = false;
    const snapshot = await fetchFdicFinancials({
      retrievedAt: RETRIEVED_AT,
      signal: AbortSignal.timeout(5_000),
      requestSignal: () => AbortSignal.timeout(20),
      pause: () => Promise.resolve(),
      fetchImpl: (input, init) => {
        if (typeof input !== 'string') throw new Error('fdic financials url');
        urls.push(input);
        if (urls.length === 1) return Promise.resolve(new Response(recorded, { status: 200 }));
        if (!hung) {
          hung = true;
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const error = new Error('timed out');
              error.name = 'TimeoutError';
              reject(error);
            });
          });
        }
        return Promise.resolve(new Response(recorded, { status: 200 }));
      },
    });
    expect(urls.filter((url) => url === financialsProbeUrl())).toHaveLength(1);
    expect(urls.filter((url) => url.includes('limit=2500'))).toHaveLength(2);
    expect(snapshot.requestCount).toBe(3);
    expect(snapshot.body.responses).toHaveLength(1);
  });

  it('hashes page bodies and ignores the fetch time', async () => {
    const body =
      '{"meta":{"total":1},"data":[{"data":{"CERT":3510,"REPDTE":"20260630"},"score":0}]}';
    const fetchImpl = () => Promise.resolve(new Response(body, { status: 200 }));
    const signal = AbortSignal.timeout(1_000);
    const first = await fetchFdicFinancials({
      retrievedAt: '2026-11-12T00:00:00.000Z',
      signal,
      requestSignal: () => signal,
      pageSize: 10,
      pause: () => Promise.resolve(),
      fetchImpl,
    });
    const second = await fetchFdicFinancials({
      retrievedAt: '2026-11-13T00:00:00.000Z',
      signal,
      requestSignal: () => signal,
      pageSize: 10,
      pause: () => Promise.resolve(),
      fetchImpl,
    });
    expect(first.sha256).toBe(second.sha256);
    expect(first.body.retrievedAt).not.toBe(second.body.retrievedAt);
  });
});

function oneBank(cert: number): string {
  return `{"meta":{"total":2},"data":[{"data":{"CERT":${String(cert)},"REPDTE":"20260630"},"score":0}]}`;
}

describe('financials publish', () => {
  it('publishes one bank_metrics version', async () => {
    const texts: string[] = [];
    const sql: Sql = {
      query: (text) => {
        texts.push(text);
        if (text.includes('select is_mock')) return Promise.resolve({ rows: [{ is_mock: true }] });
        if (text.includes('dataset_versions')) return Promise.resolve({ rows: [{ id: '12' }] });
        return Promise.resolve({ rows: [] });
      },
    };
    const [row] = parseFdicFinancials(raw(), ids);
    if (row === undefined) throw new Error('expected a call report');
    const result = await commitFinancials(sql, {
      publish: [row],
      queue: null,
      asOf: '2026-11-12T12:00:00.000Z',
      prefix: 'fdic:',
    });
    expect(result).toEqual({ queueId: null, versionId: 12 });
    expect(texts.some((text) => text.includes("publish_domain('bank_metrics'"))).toBe(true);
    expect(texts.some((text) => text.includes('deposits_usd_thousands'))).toBe(true);
  });
});

describe('previous call reports', () => {
  it('ignores a seeded mock version', async () => {
    const texts: string[] = [];
    const sql: Sql = {
      query: (text) => {
        texts.push(text);
        return Promise.resolve({ rows: [{ is_mock: true }] });
      },
    };
    await expect(previousFinancials(sql, 'fdic:')).resolves.toEqual([]);
    expect(texts.some((text) => text.includes('from bank_metrics'))).toBe(false);
  });

  it('keeps a null deposit column', async () => {
    const [row] = parseFdicFinancials(raw(), ids);
    if (row === undefined) throw new Error('expected a call report');
    const sql: Sql = {
      query: (text) => {
        if (text.includes('select is_mock')) return Promise.resolve({ rows: [{ is_mock: false }] });
        return Promise.resolve({
          rows: [
            {
              institution_id: row.report.institutionId,
              as_of: row.report.asOf,
              total_assets_usd_thousands: String(row.report.totalAssetsUsdThousands),
              deposits_usd_thousands: null,
              metrics: row.report.metrics,
              balance_sheet_mix: row.report.balanceSheetMix,
              provenance: row.report.provenance,
            },
          ],
        });
      },
    };
    const [loaded] = await previousFinancials(sql, 'fdic:');
    expect(loaded?.depositsUsdThousands).toBeNull();
    expect(loaded?.report.institutionId).toBe('fdic:3510');
  });
});
