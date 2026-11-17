import type { Sql } from './decisions';
import { SILENCE_HOURS, WEEKLY_SILENCE_HOURS } from './policy';
import { SCHEDULE, type ScheduleEntry } from './schedule';

const WEEKLY = new Set<ScheduleEntry['cadence']>(['weekly-monday', 'weekly-window']);

interface SilenceTarget {
  id: string;
  hours: number;
  /** `request_count > 0`. A skip row does not count. */
  request: boolean;
  /** Any `bank:` source, reported as `bank-rates`. */
  bank: boolean;
}

/** Ready sources, in schedule order, then the bank-rates night. */
export function silenceTargets(schedule: readonly ScheduleEntry[] = SCHEDULE): SilenceTarget[] {
  const targets: SilenceTarget[] = [];
  for (const row of schedule) {
    if (row.ready !== true || row.cron === null) continue;
    targets.push({
      id: row.id,
      hours: WEEKLY.has(row.cadence) ? WEEKLY_SILENCE_HOURS : SILENCE_HOURS,
      request: row.silence === 'request',
      bank: false,
    });
  }
  targets.push({ id: 'bank-rates', hours: SILENCE_HOURS, request: true, bank: true });
  return targets;
}

export function cutoffIso(nowMs: number, hours: number): string {
  return new Date(nowMs - hours * 60 * 60 * 1000).toISOString();
}

function idsOf(rows: readonly Record<string, unknown>[]): string[] {
  return rows.flatMap((row) => {
    const id = row['source_id'];
    return typeof id === 'string' ? [id] : [];
  });
}

async function seenSources(
  sql: Sql,
  ids: readonly string[],
  since: string,
  request: boolean,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const requestSql = request ? 'and request_count > 0' : '';
  const result = await sql.query(
    `select distinct source_id from job_runs
      where source_id = any($1::text[]) and started_at >= $2::timestamptz ${requestSql}`,
    [ids, since],
  );
  return new Set(idsOf(result.rows));
}

async function bankRequested(sql: Sql, since: string): Promise<boolean> {
  const result = await sql.query(
    `select 1 as hit from job_runs
      where source_id like 'bank:%' and request_count > 0 and started_at >= $1::timestamptz
      limit 1`,
    [since],
  );
  return result.rows.length > 0;
}

/** Source ids with no qualifying `job_runs` row. Order follows `silenceTargets`. */
export async function silentSourceIds(sql: Sql, nowMs: number): Promise<string[]> {
  const targets = silenceTargets();
  const groups = new Map<string, SilenceTarget[]>();
  for (const target of targets) {
    if (target.bank) continue;
    const key = `${String(target.hours)}:${target.request ? 'request' : 'row'}`;
    const group = groups.get(key) ?? [];
    group.push(target);
    groups.set(key, group);
  }
  const seen = new Set<string>();
  for (const group of groups.values()) {
    const first = group[0];
    if (first === undefined) continue;
    const found = await seenSources(
      sql,
      group.map((target) => target.id),
      cutoffIso(nowMs, first.hours),
      first.request,
    );
    for (const id of found) seen.add(id);
  }
  const bank = targets.find((target) => target.bank);
  if (bank !== undefined && (await bankRequested(sql, cutoffIso(nowMs, bank.hours)))) {
    seen.add(bank.id);
  }
  return targets.filter((target) => !seen.has(target.id)).map((target) => target.id);
}
