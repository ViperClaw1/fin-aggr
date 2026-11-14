import { isRate } from '@fa/contracts';
import { withTransaction, type Sql } from '../decisions';
import { isNationalSeriesId, NATIONAL_SERIES, type NationalRate } from '../fred/national';
import { integerId } from './id';
import { previousUnlessMock } from './previous';

const SOURCE_ID = 'fdic-national-rates';

const SOURCE_URL = 'https://fred.stlouisfed.org/release/tables?rid=317&eid=1217866';

export async function ensureNationalRatesSource(sql: Sql): Promise<void> {
  await sql.query(
    `insert into sources (id, name, url, kind, license, operational_kind, schedule)
     values ($1, $2, $3, 'official_api', 'public domain', 'official_api', '0 11 * * 1')
     on conflict (id) do nothing`,
    [SOURCE_ID, 'FDIC national deposit rates via FRED', SOURCE_URL],
  );
}

function rateFromDb(row: Record<string, unknown>): NationalRate {
  const seriesId = row['series_id'];
  const label = row['label'];
  const date = row['observation_date'];
  const rate = row['rate'];
  if (
    typeof seriesId !== 'string' ||
    typeof label !== 'string' ||
    typeof date !== 'string' ||
    typeof rate !== 'string' ||
    !isNationalSeriesId(seriesId) ||
    !isRate(rate)
  ) {
    throw new Error('stored national rate is invalid');
  }
  const expected = NATIONAL_SERIES.find(([id]) => id === seriesId)?.[1];
  if (expected !== label) throw new Error('stored national rate is invalid');
  return { seriesId, label, date, rate };
}

export function previousNationalRates(sql: Sql): Promise<NationalRate[]> {
  return previousUnlessMock(sql, 'national_rates', readNationalRates);
}

async function readNationalRates(sql: Sql): Promise<NationalRate[]> {
  const result = await sql.query(
    `select series_id, label, observation_date::text as observation_date, rate::text as rate
     from national_deposit_rates
     where version_id = (
       select id from dataset_versions where domain = 'national_rates' and is_current
     )`,
  );
  return result.rows.map(rateFromDb);
}

async function insertVersion(sql: Sql, asOf: string): Promise<number> {
  const result = await sql.query(
    `insert into dataset_versions (domain, as_of, is_mock, is_current)
     values ('national_rates', $1, false, false) returning id`,
    [asOf],
  );
  return integerId(result.rows[0]?.['id']);
}

async function insertRates(
  sql: Sql,
  versionId: number,
  rows: readonly NationalRate[],
): Promise<void> {
  await sql.query(
    `insert into national_deposit_rates (version_id, series_id, label, observation_date, rate)
     select $1, u.series_id, u.label, u.observation_date::date, u.rate::rate
     from unnest($2::text[], $3::text[], $4::text[], $5::text[])
       as u(series_id, label, observation_date, rate)`,
    [
      versionId,
      rows.map((row) => row.seriesId),
      rows.map((row) => row.label),
      rows.map((row) => row.date),
      rows.map((row) => row.rate),
    ],
  );
}

/** A new non-mock version. Tax, insurance, and the curve stay on their own domains. */
async function publishRates(
  sql: Sql,
  rows: readonly NationalRate[] | null,
): Promise<number | null> {
  if (rows === null || rows.length === 0) return null;
  const date = rows[0]?.date;
  if (date === undefined || rows.some((row) => row.date !== date)) {
    throw new Error('national rates date');
  }
  const versionId = await insertVersion(sql, date);
  await insertRates(sql, versionId, rows);
  await sql.query(`select publish_domain('national_rates', $1)`, [versionId]);
  await sql.query(`update sources set last_updated_at = now() where id = $1`, [SOURCE_ID]);
  return versionId;
}

export async function commitNationalRates(
  sql: Sql,
  input: {
    publish: readonly NationalRate[] | null;
    queue: { sourceId: string; domain: string; snapshotId: number; reason: string } | null;
  },
): Promise<{ queueId: number | null; versionId: number | null }> {
  return withTransaction(sql, async (tx) => {
    const versionId = await publishRates(tx, input.publish);
    if (input.queue === null) return { queueId: null, versionId };
    const queued = await tx.query(
      `insert into review_queue (source_id, domain, snapshot_id, reason)
       values ($1, $2, $3, $4) returning id`,
      [input.queue.sourceId, input.queue.domain, input.queue.snapshotId, input.queue.reason],
    );
    return { queueId: integerId(queued.rows[0]?.['id']), versionId };
  });
}
