import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import { commitFinancials } from '../postgres/financials';
import { checkFinancialsShape, fetchFdicFinancials } from './financials-fetch';
import {
  financialFieldProblems,
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
    const current = rows[0];
    if (current === undefined) throw new Error('expected a call report');
    const previous: CallReport = {
      depositsUsdThousands: current.depositsUsdThousands,
      report: {
        ...current.report,
        metrics: {
          tier1LeverageRatio: {
            value: { value: 6, marketMedian: 6, marketMean: 6, percentile: 50 },
            provenance: current.report.provenance,
          },
        },
      },
    };
    const reviewed = validateFdicFinancials(rows, [previous], '2026-11-12');
    expect(reviewed.suspicious.map((row) => row.reasons)).toEqual([['tier1LeverageRatio move']]);
    expect(validateFdicFinancials([], [], '2026-11-12').blocked).toBe('empty');
  });

  it('requests the newest quarter and checks the field names', async () => {
    const urls: string[] = [];
    const snapshot = await fetchFdicFinancials({
      retrievedAt: RETRIEVED_AT,
      signal: AbortSignal.timeout(30_000),
      pageSize: 1,
      fetchImpl: (input) => {
        if (typeof input !== 'string') throw new Error('fdic financials url');
        urls.push(input);
        return Promise.resolve(new Response(recorded, { status: 200 }));
      },
    });
    expect(urls[0]).toContain('sort_by=REPDTE');
    expect(urls[1]).toContain('REPDTE%3A20260630');
    expect(snapshot.requestCount).toBe(2);
    const line = await checkFinancialsShape(() => Promise.resolve(new Response(recorded)));
    expect(line).toBe('fdic financials shape ok');
  });
});

describe('financials publish', () => {
  it('publishes one bank_metrics version', async () => {
    const texts: string[] = [];
    const sql: Sql = {
      query: (text) => {
        texts.push(text);
        if (text.includes('dataset_versions')) return Promise.resolve({ rows: [{ id: '12' }] });
        return Promise.resolve({ rows: [] });
      },
    };
    const [row] = parseFdicFinancials(raw(), ids);
    if (row === undefined) throw new Error('expected a call report');
    const result = await commitFinancials(sql, { publish: [row], queue: null });
    expect(result).toEqual({ queueId: null, versionId: 12 });
    expect(texts.some((text) => text.includes("publish_domain('bank_metrics'"))).toBe(true);
    expect(texts.some((text) => text.includes('deposits_usd_thousands'))).toBe(true);
  });
});
