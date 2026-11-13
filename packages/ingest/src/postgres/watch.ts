import { withTransaction, type Sql } from '../decisions';
import { integerId } from './id';

const WATCH_SOURCES = [
  {
    id: 'ecfr-330',
    name: 'eCFR 12 CFR 330',
    url: 'https://www.ecfr.gov/api/versioner/v1/versions/title-12.json?part=330',
  },
  {
    id: 'ecfr-745',
    name: 'eCFR 12 CFR 745',
    url: 'https://www.ecfr.gov/api/versioner/v1/versions/title-12.json?part=745',
  },
  {
    id: 'ecfr-328',
    name: 'eCFR 12 CFR 328',
    url: 'https://www.ecfr.gov/api/versioner/v1/versions/title-12.json?part=328',
  },
  {
    id: 'federal-register',
    name: 'Federal Register documents',
    url: 'https://www.federalregister.gov/api/v1/documents.json',
  },
] as const;

export async function ensureWatchSources(sql: Sql): Promise<void> {
  for (const source of WATCH_SOURCES) {
    await sql.query(
      `insert into sources (id, name, url, kind, license, operational_kind, schedule)
       values ($1, $2, $3, 'official_api', 'public domain', 'official_api', '0 5 * * *')
       on conflict (id) do nothing`,
      [source.id, source.name, source.url],
    );
  }
}

/** A watch queue row only. A non-null publish is a mistake. */
export async function commitWatch(
  sql: Sql,
  input: {
    publish: readonly unknown[] | null;
    queue: { sourceId: string; domain: string; snapshotId: number; reason: string } | null;
  },
): Promise<{ queueId: number | null; versionId: number | null }> {
  if (input.publish !== null) throw new Error('watch does not publish');
  const queue = input.queue;
  if (queue === null) return { queueId: null, versionId: null };
  return withTransaction(sql, async (tx) => {
    const result = await tx.query(
      `insert into review_queue (source_id, domain, snapshot_id, reason)
       values ($1, $2, $3, $4) returning id`,
      [queue.sourceId, queue.domain, queue.snapshotId, queue.reason],
    );
    return { queueId: integerId(result.rows[0]?.['id']), versionId: null };
  });
}
