import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Product } from '@fa/contracts';
import { describe, expect, it, vi } from 'vitest';
import { PUBLISH_ENV, revalidateWarning, runCommand, type CliDeps } from './cli';
import type { Sql } from './decisions';
import { readAmex } from './scrape/banks/27471';

const FIXTURE = readFileSync(join(import.meta.dirname, 'banks/amex.fixture.json'), 'utf8');
const SNAPSHOT_DAY = '2026-11-15';
const PRODUCT = readAmex(FIXTURE, SNAPSHOT_DAY).products[0];
if (PRODUCT === undefined) throw new Error('fixture has no product');
const PRODUCT_ID = PRODUCT.id;

const ENV: NodeJS.ProcessEnv = Object.fromEntries(PUBLISH_ENV.map((name) => [name, 'set']));

function storedRow(product: Product): Record<string, unknown> {
  const cents = (value: number | null): string | null => (value === null ? null : String(value));
  return {
    id: product.id,
    institution_id: product.institutionId,
    category: product.category,
    name: product.name,
    term_months: product.termMonths,
    tier_mode: product.tierMode,
    compounding: product.compounding,
    min_opening: cents(product.minOpening),
    max_deposit: cents(product.maxDeposit),
    early_withdrawal: product.earlyWithdrawal,
    eligibility: product.eligibility,
    tax_treatment: product.taxTreatment,
    valid_from: product.validFrom,
    valid_to: product.validTo,
    provenance: product.provenance,
    tiers: product.tiers.map((tier) => ({
      minBalance: cents(tier.minBalance),
      maxBalance: cents(tier.maxBalance),
      apy: tier.apy,
    })),
  };
}

function bankDb(
  status: 'open' | 'approved',
  current: readonly Product[],
): Sql & { texts: string[] } {
  const texts: string[] = [];
  return {
    texts,
    query: (text, values) => {
      const flat = text.replace(/\s+/g, ' ').trim();
      texts.push(flat);
      const rows = ((): Record<string, unknown>[] => {
        if (flat.startsWith('select id, source_id') && values?.[1] === status) {
          return [
            {
              id: 5,
              source_id: 'bank:fdic:27471',
              domain: 'bank_products',
              reason: `${PRODUCT_ID}: first_connection`,
              snapshot_id: 9,
              issue_url: null,
            },
          ];
        }
        if (flat.includes('from bank_confirmations')) return [{ verified_at: '2026-11-16' }];
        if (flat.includes('from raw_snapshots')) return [{ bucket_path: 'p', day: SNAPSHOT_DAY }];
        if (flat.startsWith('update review_queue')) return [{ id: 5 }];
        if (flat.startsWith('select is_mock')) return [{ is_mock: current.length === 0 }];
        if (flat.startsWith('select id, institution_id')) return current.map(storedRow);
        if (flat.startsWith('insert into dataset_versions')) return [{ id: 7 }];
        return [];
      })();
      return Promise.resolve({ rows });
    },
  };
}

function harness(sql: Sql, revalidate: () => Promise<void> = () => Promise.resolve()) {
  const lines: string[] = [];
  const warnings: string[] = [];
  const order: string[] = [];
  const deps: CliDeps = {
    withSql: (run) => run(sql),
    snapshot: () => Promise.resolve(new TextEncoder().encode(FIXTURE)),
    revalidate: () => {
      order.push('revalidate');
      return revalidate();
    },
  };
  const io = {
    log: (line: string) => lines.push(line),
    warn: (line: string) => warnings.push(line),
    ghLogin: () => Promise.resolve('ViperClaw1'),
    now: () => '2026-11-18T10:00:00.000Z',
  };
  return { deps, io, lines, warnings, order };
}

describe('ingest:approve on a bank row', () => {
  it('refuses before touching the database when a required env var is missing', async () => {
    const withSql = vi.fn();
    const deps = { withSql, snapshot: vi.fn(), revalidate: vi.fn() } as unknown as CliDeps;
    const env = { ...ENV, REVALIDATE_SECRET: '' };
    const h = harness(bankDb('open', []));
    await expect(runCommand(env, ['approve', '5'], h.io, deps)).rejects.toThrow(
      'missing env: REVALIDATE_SECRET',
    );
    expect(withSql).not.toHaveBeenCalled();
  });

  it('commits the decision, the confirmation, and the publish in one transaction, then revalidates', async () => {
    const sql = bankDb('open', []);
    const h = harness(sql);
    await runCommand(ENV, ['approve', '5'], h.io, h.deps);
    const begin = sql.texts.indexOf('begin');
    const commit = sql.texts.indexOf('commit');
    const inside = sql.texts.slice(begin, commit);
    expect(sql.texts.filter((text) => text === 'begin')).toHaveLength(1);
    expect(inside.some((text) => text.startsWith('update review_queue'))).toBe(true);
    expect(inside.some((text) => text.includes('insert into bank_product_confirmations'))).toBe(
      true,
    );
    expect(inside.some((text) => text.includes("publish_domain('bank_products'"))).toBe(true);
    expect(h.lines).toContain('review 5 published version=7');
    expect(h.order).toEqual(['revalidate']);
  });

  it('warns with the manual command when revalidate fails, and does not throw', async () => {
    const h = harness(bankDb('open', []), () => Promise.reject(new Error('503')));
    await runCommand(ENV, ['approve', '5'], h.io, h.deps);
    expect(h.warnings).toContain(revalidateWarning('bank_products'));
    expect(revalidateWarning('bank_products')).toContain('pnpm ingest:revalidate bank_products');
  });
});

describe('ingest:publish-approved', () => {
  it('publishes the confirmed products of an approved row', async () => {
    const sql = bankDb('approved', []);
    const h = harness(sql);
    await runCommand(ENV, ['publish-approved', '5'], h.io, h.deps);
    expect(h.lines).toEqual(['review 5 published version=7']);
    expect(h.order).toEqual(['revalidate']);
  });

  it('publishes nothing when the products are already in the current version', async () => {
    const current = readAmex(FIXTURE, SNAPSHOT_DAY).products.filter((row) => row.id === PRODUCT_ID);
    const sql = bankDb('approved', current);
    const h = harness(sql);
    await runCommand(ENV, ['publish-approved', '5'], h.io, h.deps);
    expect(h.lines).toEqual(['review 5 already published']);
    expect(sql.texts.some((text) => text.includes('publish_domain'))).toBe(false);
    expect(h.order).toEqual([]);
  });
});
