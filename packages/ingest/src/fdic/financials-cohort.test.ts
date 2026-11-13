import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Sql } from '../decisions';
import { commitFinancials } from '../postgres/financials';
import { parseFdicFinancials, type FdicFinancialsRaw } from './financials';

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

describe('financials cohort', () => {
  it('keeps a credit-union report and does not treat its quarter as mixed', async () => {
    const [row] = parseFdicFinancials(raw(), ids);
    if (row === undefined) throw new Error('expected a call report');
    const texts: string[] = [];
    const values: unknown[][] = [];
    const sql: Sql = {
      query: (text, params) => {
        texts.push(text);
        values.push([...(params ?? [])]);
        if (text.includes('select is_mock')) return Promise.resolve({ rows: [{ is_mock: false }] });
        if (text.includes('from bank_metrics')) {
          return Promise.resolve({
            rows: [
              {
                institution_id: 'ncua:9',
                as_of: '2026-03-31',
                total_assets_usd_thousands: '10',
                deposits_usd_thousands: null,
                metrics: row.report.metrics,
                balance_sheet_mix: [],
                provenance: row.report.provenance,
              },
            ],
          });
        }
        if (text.includes('dataset_versions')) return Promise.resolve({ rows: [{ id: '12' }] });
        return Promise.resolve({ rows: [] });
      },
    };
    const result = await commitFinancials(sql, {
      publish: [row],
      queue: null,
      asOf: '2026-11-12T12:00:00.000Z',
      prefix: 'fdic:',
    });
    expect(result.versionId).toBe(12);
    const version = values.find((params) => params[0] === '2026-11-12');
    expect(version).toBeDefined();
    const insert = values.find((params) => JSON.stringify(params).includes('ncua:9'));
    expect(insert?.[1]).toEqual(['ncua:9', row.report.institutionId]);
    expect(texts.some((text) => text.includes("publish_domain('bank_metrics'"))).toBe(true);
  });

  it('keeps a bank report when the credit-union file is published', async () => {
    const [row] = parseFdicFinancials(raw(), ids);
    if (row === undefined) throw new Error('expected a call report');
    const creditUnion = {
      ...row,
      report: { ...row.report, institutionId: 'ncua:9' },
    };
    const values: unknown[][] = [];
    const sql: Sql = {
      query: (text, params) => {
        values.push([...(params ?? [])]);
        if (text.includes('select is_mock')) return Promise.resolve({ rows: [{ is_mock: false }] });
        if (text.includes('from bank_metrics')) {
          return Promise.resolve({
            rows: [
              {
                institution_id: row.report.institutionId,
                as_of: '2026-03-31',
                total_assets_usd_thousands: String(row.report.totalAssetsUsdThousands),
                deposits_usd_thousands: String(row.depositsUsdThousands),
                metrics: row.report.metrics,
                balance_sheet_mix: [],
                provenance: row.report.provenance,
              },
            ],
          });
        }
        if (text.includes('dataset_versions')) return Promise.resolve({ rows: [{ id: '12' }] });
        return Promise.resolve({ rows: [] });
      },
    };
    await commitFinancials(sql, {
      publish: [creditUnion],
      queue: null,
      asOf: '2026-11-12T12:00:00.000Z',
      prefix: 'ncua:',
      sourceId: 'ncua-5300',
    });
    const insert = values.find((params) => JSON.stringify(params).includes('fdic:'));
    expect(insert?.[1]).toEqual([row.report.institutionId, 'ncua:9']);
  });
});
