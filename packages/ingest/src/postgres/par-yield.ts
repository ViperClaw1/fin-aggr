import { isRate } from '@fa/contracts';
import { withTransaction, type Sql } from '../decisions';
import { PAR_TENORS, type ParTenor, type ParYieldPoint } from '../treasury/par-yield';
import { integerId } from './id';

const SOURCE_ID = 'treasury-par-yield';

const SOURCE_URL =
  'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv';

export async function ensureParYieldSource(sql: Sql): Promise<void> {
  await sql.query(
    `insert into sources (id, name, url, kind, license, operational_kind, schedule)
     values ($1, $2, $3, 'official_api', 'public domain', 'official_api', '30 23 * * *')
     on conflict (id) do nothing`,
    [SOURCE_ID, 'Daily Treasury Par Yield Curve', SOURCE_URL],
  );
}

function isParTenor(value: string): value is ParTenor {
  return (PAR_TENORS as readonly string[]).includes(value);
}

function pointFromDb(row: Record<string, unknown>): ParYieldPoint {
  const date = row['curve_date'];
  const tenor = row['tenor'];
  const rate = row['rate'];
  if (typeof date !== 'string' || typeof tenor !== 'string' || typeof rate !== 'string') {
    throw new Error('stored par yield is invalid');
  }
  if (!isParTenor(tenor) || !isRate(rate)) throw new Error('stored par yield is invalid');
  return { date, tenor, rate };
}

/** Newest stored curve only, so a new calendar year is not a shrink and an old spike is not a hold. */
export async function previousParYields(sql: Sql): Promise<ParYieldPoint[]> {
  const result = await sql.query(
    `select curve_date::text as curve_date, tenor, rate::text as rate
     from par_yields
     where version_id = (
       select id from dataset_versions where domain = 'reference' and is_current
     )
       and curve_date = (
         select max(curve_date) from par_yields
         where version_id = (
           select id from dataset_versions where domain = 'reference' and is_current
         )
       )`,
  );
  return result.rows.map(pointFromDb);
}

function newestCurveDate(rows: readonly ParYieldPoint[]): string {
  const date = [...rows]
    .map((row) => row.date)
    .sort()
    .at(-1);
  if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error('as_of is not a date');
  return date;
}

async function currentReferenceVersion(sql: Sql): Promise<number | null> {
  const result = await sql.query(
    `select id from dataset_versions where domain = 'reference' and is_current`,
  );
  const id = result.rows[0]?.['id'];
  return id === undefined ? null : integerId(id);
}

async function insertReferenceVersion(sql: Sql, asOf: string): Promise<number> {
  const result = await sql.query(
    `insert into dataset_versions (domain, as_of, is_mock, is_current)
     values ('reference', $1, false, false) returning id`,
    [asOf],
  );
  return integerId(result.rows[0]?.['id']);
}

async function insertParYields(
  sql: Sql,
  versionId: number,
  rows: readonly ParYieldPoint[],
): Promise<void> {
  await sql.query(
    `insert into par_yields (version_id, curve_date, tenor, rate)
     select $1, u.curve_date::date, u.tenor, u.rate::rate
     from unnest($2::text[], $3::text[], $4::text[]) as u(curve_date, tenor, rate)`,
    [
      versionId,
      rows.map((row) => row.date),
      rows.map((row) => row.tenor),
      rows.map((row) => row.rate),
    ],
  );
}

/**
 * Tax and insurance already occupy the current `reference` version.
 * `publish_domain` would hide them from anon, so a later curve replaces only `par_yields`.
 */
async function publishParYields(
  sql: Sql,
  rows: readonly ParYieldPoint[] | null,
): Promise<number | null> {
  if (rows === null || rows.length === 0) return null;
  const existing = await currentReferenceVersion(sql);
  const versionId = existing ?? (await insertReferenceVersion(sql, newestCurveDate(rows)));
  if (existing !== null)
    await sql.query(`delete from par_yields where version_id = $1`, [versionId]);
  await insertParYields(sql, versionId, rows);
  if (existing === null) await sql.query(`select publish_domain('reference', $1)`, [versionId]);
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

export async function commitParYields(
  sql: Sql,
  input: {
    publish: readonly ParYieldPoint[] | null;
    queue: { sourceId: string; domain: string; snapshotId: number; reason: string } | null;
  },
): Promise<{ queueId: number | null; versionId: number | null }> {
  return withTransaction(sql, async (tx) => {
    const versionId = await publishParYields(tx, input.publish);
    const queueId = await enqueue(tx, input.queue);
    return { queueId, versionId };
  });
}
