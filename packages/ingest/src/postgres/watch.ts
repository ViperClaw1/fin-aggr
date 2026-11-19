import { enqueueReview, withTransaction, type Sql } from '../decisions';

const OFFICIAL = {
  kind: 'official_api',
  license: 'public domain',
  operationalKind: 'official_api',
  schedule: '47 5 * * *',
} as const;

const WATCH_SOURCES = [
  {
    id: 'ecfr-330',
    name: 'eCFR 12 CFR 330',
    url: 'https://www.ecfr.gov/api/versioner/v1/versions/title-12.json?part=330',
    ...OFFICIAL,
  },
  {
    id: 'ecfr-745',
    name: 'eCFR 12 CFR 745',
    url: 'https://www.ecfr.gov/api/versioner/v1/versions/title-12.json?part=745',
    ...OFFICIAL,
  },
  {
    id: 'ecfr-328',
    name: 'eCFR 12 CFR 328',
    url: 'https://www.ecfr.gov/api/versioner/v1/versions/title-12.json?part=328',
    ...OFFICIAL,
  },
  {
    id: 'federal-register',
    name: 'Federal Register documents',
    url: 'https://www.federalregister.gov/api/v1/documents.json',
    ...OFFICIAL,
  },
  {
    id: 'amex-cd-page',
    name: 'American Express CD page sentences',
    url: 'https://www.americanexpress.com/en-us/banking/online-savings/cd-account/',
    kind: 'issuer_document',
    license: 'issuer terms',
    operationalKind: 'scrape',
    schedule: '17 4-12 * * * and 47 4-12 * * *',
  },
] as const;

export async function ensureWatchSources(sql: Sql): Promise<void> {
  for (const source of WATCH_SOURCES) {
    await sql.query(
      `insert into sources (id, name, url, kind, license, operational_kind, schedule)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do nothing`,
      [
        source.id,
        source.name,
        source.url,
        source.kind,
        source.license,
        source.operationalKind,
        source.schedule,
      ],
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
): Promise<{ queueId: number | null; versionId: number | null; issueUrl: string | null }> {
  if (input.publish !== null) throw new Error('watch does not publish');
  const queue = input.queue;
  if (queue === null) return { queueId: null, versionId: null, issueUrl: null };
  return withTransaction(sql, async (tx) => {
    const queued = await enqueueReview(tx, queue);
    return { queueId: queued.queueId, versionId: null, issueUrl: queued.issueUrl };
  });
}
