import { enqueueReview, withTransaction, type Sql } from '../decisions';
import type { NcuaRow } from '../ncua/parse';
import { replaceCohortFinancials } from './financials';
import { replaceCohortInstitutions } from './institutions';

const SOURCE_ID = 'ncua-5300';

export async function ensureNcuaSource(sql: Sql): Promise<void> {
  await sql.query(
    `insert into sources (id, name, url, kind, license, operational_kind, schedule)
     values ($1, $2, $3, 'official_api', 'public domain', 'official_api', '0 11 * * 1')
     on conflict (id) do nothing`,
    [
      SOURCE_ID,
      'NCUA 5300 call report',
      'https://ncua.gov/analysis/credit-union-corporate-call-report-data/quarterly-data',
    ],
  );
}

function asOfDate(iso: string): string {
  const date = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('as_of is not a date');
  return date;
}

/**
 * One transaction writes both domains. A credit-union publish keeps bank rows.
 * The version date is the run day. The quarter stays on each metrics row.
 */
export async function commitNcua(
  sql: Sql,
  input: {
    publish: readonly NcuaRow[] | null;
    queue: { sourceId: string; domain: string; snapshotId: number; reason: string } | null;
    asOf: string;
  },
): Promise<{ queueId: number | null; versionId: number | null }> {
  const asOf = asOfDate(input.asOf);
  const institutions = input.publish?.map((row) => row.institution) ?? null;
  const reports =
    input.publish === null
      ? null
      : input.publish.flatMap((row) => (row.report === null ? [] : [row.report]));
  return withTransaction(sql, async (tx) => {
    const versionId = await replaceCohortInstitutions(tx, {
      rows: institutions,
      asOf,
      prefix: 'ncua:',
      sourceId: SOURCE_ID,
    });
    await replaceCohortFinancials(tx, {
      rows: reports !== null && reports.length > 0 ? reports : null,
      asOf: input.asOf,
      prefix: 'ncua:',
      sourceId: SOURCE_ID,
    });
    if (input.queue === null) return { queueId: null, versionId, issueUrl: null };
    const queued = await enqueueReview(tx, input.queue);
    return { queueId: queued.queueId, versionId, issueUrl: queued.issueUrl };
  });
}
