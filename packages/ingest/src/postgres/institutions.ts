import { Institution, type Institution as InstitutionRow } from '@fa/contracts';
import { enqueueReview, withTransaction, type Sql } from '../decisions';
import { type CohortPrefix, otherCohort } from './cohort';
import { integerId } from './id';
import { previousUnlessMock } from './previous';

const SOURCE_ID = 'fdic-institutions';

export async function ensureFdicSource(sql: Sql): Promise<void> {
  await sql.query(
    `insert into sources (id, name, url, kind, license, operational_kind, schedule)
     values ($1, $2, $3, 'official_api', 'public domain', 'official_api', '0 7 * * *')
     on conflict (id) do nothing`,
    [SOURCE_ID, 'FDIC BankFind institutions', 'https://api.fdic.gov/banks/institutions'],
  );
}

export async function latestSnapshotHash(sql: Sql, sourceId: string): Promise<string | null> {
  const result = await sql.query(
    `select sha256 from raw_snapshots where source_id = $1 order by id desc limit 1`,
    [sourceId],
  );
  const hash = result.rows[0]?.['sha256'];
  return typeof hash === 'string' ? hash : null;
}

export async function insertSnapshot(
  sql: Sql,
  input: { sourceId: string; sha256: string; bucketPath: string; bytes: number },
): Promise<number> {
  const result = await sql.query(
    `insert into raw_snapshots (source_id, sha256, bucket_path, bytes)
     values ($1, $2, $3, $4) returning id`,
    [input.sourceId, input.sha256, input.bucketPath, input.bytes],
  );
  return integerId(result.rows[0]?.['id']);
}

function institutionFromDb(row: Record<string, unknown>): InstitutionRow {
  const parsed = Institution.safeParse({
    id: row['id'],
    name: row['name'],
    regulator: row['regulator'],
    kind: row['kind'],
    partnerInstitutionIds: row['partner_institution_ids'],
    hqState: row['hq_state'],
    website: row['website'],
    provenance: row['provenance'],
  });
  if (!parsed.success) throw new Error('stored institution is invalid');
  return parsed.data;
}

/** Own prefix only. The count gate must not see the other regulator. */
export function previousInstitutions(sql: Sql, prefix: CohortPrefix): Promise<InstitutionRow[]> {
  return previousUnlessMock(sql, 'institutions', (db) => readInstitutions(db, prefix));
}

const INSTITUTION_COLUMNS = `i.id, i.name, i.regulator, i.kind, i.partner_institution_ids, i.hq_state, i.website, i.provenance`;

async function readInstitutions(sql: Sql, prefix?: CohortPrefix): Promise<InstitutionRow[]> {
  const result = await sql.query(
    `select ${INSTITUTION_COLUMNS}
     from institutions i
     join dataset_versions v on v.id = i.version_id
     where v.domain = 'institutions' and v.is_current${prefix === undefined ? '' : ' and i.id like $1'}
     order by i.id`,
    prefix === undefined ? [] : [`${prefix}%`],
  );
  return result.rows.map(institutionFromDb);
}

function asOfDate(iso: string): string {
  const date = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('as_of is not a date');
  return date;
}

async function insertInstitutionRows(
  sql: Sql,
  versionId: number,
  rows: readonly InstitutionRow[],
): Promise<void> {
  if (rows.some((row) => row.partnerInstitutionIds.length > 0)) {
    throw new Error('fdic institutions do not carry partner banks');
  }
  await sql.query(
    `insert into institutions (
       version_id, id, name, regulator, kind, partner_institution_ids, hq_state, website, provenance
     )
     select $1, u.id, u.name, u.regulator, u.kind, '{}', u.hq_state, nullif(u.website, ''), u.provenance::jsonb
     from unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
       as u(id, name, regulator, kind, hq_state, website, provenance)`,
    [
      versionId,
      rows.map((row) => row.id),
      rows.map((row) => row.name),
      rows.map((row) => row.regulator),
      rows.map((row) => row.kind),
      rows.map((row) => row.hqState),
      rows.map((row) => row.website ?? ''),
      rows.map((row) => JSON.stringify(row.provenance)),
    ],
  );
}

async function insertVersion(sql: Sql, asOf: string): Promise<number> {
  const result = await sql.query(
    `insert into dataset_versions (domain, as_of, is_mock, is_current)
     values ('institutions', $1, false, false) returning id`,
    [asOf],
  );
  return integerId(result.rows[0]?.['id']);
}

export async function commitInstitutions(
  sql: Sql,
  input: {
    publish: readonly InstitutionRow[] | null;
    queue: { sourceId: string; domain: string; snapshotId: number; reason: string } | null;
    asOf: string;
    /** Whose rows this run replaces. The other prefix is copied unchanged. */
    prefix: CohortPrefix;
    sourceId?: string;
  },
): Promise<{ queueId: number | null; versionId: number | null }> {
  const asOf = asOfDate(input.asOf);
  return withTransaction(sql, async (tx) => {
    const versionId = await replaceCohortInstitutions(tx, {
      rows: input.publish,
      asOf,
      prefix: input.prefix,
      sourceId: input.sourceId,
    });
    const queued = await enqueue(tx, input.queue);
    return { queueId: queued?.queueId ?? null, versionId, issueUrl: queued?.issueUrl ?? null };
  });
}

/** Replaces this prefix and copies every other id. Caller owns the transaction. */
export async function replaceCohortInstitutions(
  sql: Sql,
  input: {
    rows: readonly InstitutionRow[] | null;
    asOf: string;
    prefix: CohortPrefix;
    sourceId?: string | undefined;
  },
): Promise<number | null> {
  const { rows, asOf, prefix } = input;
  if (rows === null || rows.length === 0) return null;
  const current = await previousUnlessMock(sql, 'institutions', (db) => readInstitutions(db));
  const kept = otherCohort(current, (row) => row.id, prefix);
  const versionId = await insertVersion(sql, asOf);
  await insertInstitutionRows(sql, versionId, [...kept, ...rows]);
  await sql.query(`select publish_domain('institutions', $1)`, [versionId]);
  await sql.query(`update sources set last_updated_at = now() where id = $1`, [
    input.sourceId ?? SOURCE_ID,
  ]);
  return versionId;
}

async function enqueue(
  sql: Sql,
  queue: { sourceId: string; domain: string; snapshotId: number; reason: string } | null,
): Promise<{ queueId: number; issueUrl: string | null } | null> {
  if (queue === null) return null;
  return enqueueReview(sql, queue);
}
