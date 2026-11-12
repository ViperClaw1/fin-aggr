import { BankMetrics } from '@fa/contracts';
import { withTransaction, type Sql } from '../decisions';
import type { CallReport } from '../fdic/financials';
import { integerId } from './id';

const SOURCE_ID = 'fdic-financials';

export async function ensureFinancialsSource(sql: Sql): Promise<void> {
  await sql.query(
    `insert into sources (id, name, url, kind, license, operational_kind, schedule)
     values ($1, $2, $3, 'official_api', 'public domain', 'official_api', '0 11 * * 1')
     on conflict (id) do nothing`,
    [SOURCE_ID, 'FDIC BankFind financials', 'https://api.fdic.gov/banks/financials'],
  );
}

export async function currentInstitutionIds(sql: Sql): Promise<Set<string>> {
  const result = await sql.query(
    `select i.id from institutions i
     join dataset_versions v on v.id = i.version_id
     where v.domain = 'institutions' and v.is_current`,
  );
  const ids = result.rows.map((row) => row['id']);
  if (ids.some((id) => typeof id !== 'string')) throw new Error('stored institution id is invalid');
  return new Set(ids.filter((id): id is string => typeof id === 'string'));
}

function storedInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value) && value.length <= 15) {
    let parsed = 0;
    for (const char of value) parsed = parsed * 10 + (char.charCodeAt(0) - 48);
    return parsed;
  }
  throw new Error('stored call report is invalid');
}

function reportFromDb(row: Record<string, unknown>): CallReport {
  const parsed = BankMetrics.safeParse({
    institutionId: row['institution_id'],
    asOf: row['as_of'],
    totalAssetsUsdThousands: storedInteger(row['total_assets_usd_thousands']),
    metrics: row['metrics'],
    balanceSheetMix: row['balance_sheet_mix'],
    provenance: row['provenance'],
  });
  if (!parsed.success) throw new Error('stored call report is invalid');
  return {
    report: parsed.data,
    depositsUsdThousands: storedInteger(row['deposits_usd_thousands']),
  };
}

export async function previousFinancials(sql: Sql): Promise<CallReport[]> {
  const result = await sql.query(
    `select m.institution_id, m.as_of::text as as_of, m.total_assets_usd_thousands,
            m.deposits_usd_thousands, m.metrics, m.balance_sheet_mix, m.provenance
     from bank_metrics m
     join dataset_versions v on v.id = m.version_id
     where v.domain = 'bank_metrics' and v.is_current`,
  );
  return result.rows.map(reportFromDb);
}

async function insertVersion(sql: Sql, asOf: string): Promise<number> {
  const result = await sql.query(
    `insert into dataset_versions (domain, as_of, is_mock, is_current)
     values ('bank_metrics', $1, false, false) returning id`,
    [asOf],
  );
  return integerId(result.rows[0]?.['id']);
}

async function insertRows(sql: Sql, versionId: number, rows: readonly CallReport[]): Promise<void> {
  await sql.query(
    `insert into bank_metrics (
       version_id, institution_id, as_of, total_assets_usd_thousands, deposits_usd_thousands,
       metrics, balance_sheet_mix, provenance
     )
     select $1, u.institution_id, u.as_of::date, u.assets::bigint, u.deposits::bigint,
            u.metrics::jsonb, u.mix::jsonb, u.provenance::jsonb
     from unnest(
       $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[]
     ) as u(institution_id, as_of, assets, deposits, metrics, mix, provenance)`,
    [
      versionId,
      rows.map((row) => row.report.institutionId),
      rows.map((row) => row.report.asOf),
      rows.map((row) => String(row.report.totalAssetsUsdThousands)),
      rows.map((row) => String(row.depositsUsdThousands)),
      rows.map((row) => JSON.stringify(row.report.metrics)),
      rows.map((row) => JSON.stringify(row.report.balanceSheetMix)),
      rows.map((row) => JSON.stringify(row.report.provenance)),
    ],
  );
}

async function publishRows(sql: Sql, rows: readonly CallReport[] | null): Promise<number | null> {
  if (rows === null || rows.length === 0) return null;
  const asOf = rows[0]?.report.asOf;
  if (asOf === undefined || rows.some((row) => row.report.asOf !== asOf)) {
    throw new Error('fdic financials mixed quarter');
  }
  const versionId = await insertVersion(sql, asOf);
  await insertRows(sql, versionId, rows);
  await sql.query(`select publish_domain('bank_metrics', $1)`, [versionId]);
  await sql.query(`update sources set last_updated_at = now() where id = $1`, [SOURCE_ID]);
  return versionId;
}

async function enqueue(
  sql: Sql,
  queue: { sourceId: string; domain: string; snapshotId: number; reason: string } | null,
): Promise<number | null> {
  if (queue === null) return null;
  const result = await sql.query(
    `insert into review_queue (source_id, domain, snapshot_id, reason)
     values ($1, $2, $3, $4) returning id`,
    [queue.sourceId, queue.domain, queue.snapshotId, queue.reason],
  );
  return integerId(result.rows[0]?.['id']);
}

export async function commitFinancials(
  sql: Sql,
  input: {
    publish: readonly CallReport[] | null;
    queue: { sourceId: string; domain: string; snapshotId: number; reason: string } | null;
  },
): Promise<{ queueId: number | null; versionId: number | null }> {
  return withTransaction(sql, async (tx) => ({
    versionId: await publishRows(tx, input.publish),
    queueId: await enqueue(tx, input.queue),
  }));
}
