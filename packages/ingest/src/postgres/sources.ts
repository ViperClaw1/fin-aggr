import { databaseUrl, withClient } from '../db';
import type { Sql } from '../decisions';
import { requireReviewer } from '../policy';
import { isBankSourceId, optOutLate } from '../scrape/rules';

/** Captcha, a block, or a broken adapter. The previous published rows stay. */
async function markSourceManual(sql: Sql, sourceId: string, reason: string): Promise<void> {
  const result = await sql.query(
    `update sources set status = 'manual', notes = $2 where id = $1 returning id`,
    [sourceId, reason],
  );
  if (result.rows.length === 0) throw new Error(`unknown source ${sourceId}`);
}

/** No database in a unit test: the log line is still written by the session. */
export async function markSourceManualFromEnv(
  env: NodeJS.ProcessEnv,
  sourceId: string,
  reason: string,
): Promise<void> {
  const url = env['SUPABASE_DB_URL']?.trim() ?? '';
  if (url === '') return;
  await withClient(databaseUrl(env), (sql) => markSourceManual(sql, sourceId, reason));
}

/**
 * Manual back to active, with a row in `source_status_log`. An opted-out bank
 * is not resumed: the opt-out is the bank's decision, not a fault.
 */
export async function resumeSource(
  sql: Sql,
  input: { sourceId: string; reason: string; by: string },
): Promise<void> {
  const by = requireReviewer(input.by);
  if (input.reason.trim() === '') throw new Error('reason is required');
  await sql.query('begin');
  try {
    const result = await sql.query(
      `update sources set status = 'active', notes = null
        where id = $1 and status = 'manual' and excluded is not true
        returning id`,
      [input.sourceId],
    );
    if (result.rows.length === 0) {
      throw new Error(`source ${input.sourceId} is not manual, or is excluded`);
    }
    await sql.query(
      `insert into source_status_log (source_id, from_status, to_status, reason, login)
       values ($1, 'manual', 'active', $2, $3)`,
      [input.sourceId, input.reason.trim(), by],
    );
    await sql.query('commit');
  } catch (error) {
    await sql.query('rollback');
    throw error;
  }
}

export interface OptOut {
  sourceId: string;
  requestedAt: string;
  appliedAt: string;
  by: string;
}

/** Sets the opt-out flag. A late application still excludes the bank. */
export async function excludeSource(
  sql: Sql,
  input: OptOut,
): Promise<'excluded' | 'excluded late'> {
  if (!isBankSourceId(input.sourceId)) throw new Error(`unknown source ${input.sourceId}`);
  const by = requireReviewer(input.by);
  const late = optOutLate(input.requestedAt, input.appliedAt);
  const result = await sql.query(
    `update sources
       set excluded = true,
           status = 'manual',
           opt_out_requested_at = $2,
           opt_out_applied_at = $3,
           opt_out_by = $4
     where id = $1
     returning id`,
    [input.sourceId, input.requestedAt, input.appliedAt, by],
  );
  if (result.rows.length === 0) throw new Error(`unknown source ${input.sourceId}`);
  return late ? 'excluded late' : 'excluded';
}
