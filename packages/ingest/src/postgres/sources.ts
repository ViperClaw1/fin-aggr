import { databaseUrl, withClient } from '../db';
import type { Sql } from '../decisions';
import { requireReviewer } from '../policy';
import { isBankSourceId, optOutLate } from '../scrape/rules';

/** Captcha or a block. The previous published rows stay. */
async function markSourceManual(sql: Sql, sourceId: string): Promise<void> {
  const result = await sql.query(
    `update sources set status = 'manual' where id = $1 returning id`,
    [sourceId],
  );
  if (result.rows.length === 0) throw new Error(`unknown source ${sourceId}`);
}

/** No database in a unit test: the log line is still written by the session. */
export async function markSourceManualFromEnv(
  env: NodeJS.ProcessEnv,
  sourceId: string,
): Promise<void> {
  const url = env['SUPABASE_DB_URL']?.trim() ?? '';
  if (url === '') return;
  await withClient(databaseUrl(env), (sql) => markSourceManual(sql, sourceId));
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
