import type { Sql } from './decisions';
import { SILENCE_HOURS } from './policy';
import { cutoffIso } from './silence';

/**
 * Workflow files whose pg_cron dispatch failed (non-2xx, timeout, or no answer)
 * within the silence window. Rows come from `dispatch_log`, which the
 * `harvest-dispatches` job fills from `net._http_response` (ADR-020).
 */
export async function failedDispatches(sql: Sql, nowMs: number): Promise<string[]> {
  const result = await sql.query(
    `select workflow, count(*)::int as n from dispatch_log
      where failed and requested_at >= $1::timestamptz
      group by workflow order by workflow`,
    [cutoffIso(nowMs, SILENCE_HOURS)],
  );
  return result.rows.flatMap((row) => {
    const workflow = row['workflow'];
    return typeof workflow === 'string' ? [workflow] : [];
  });
}

export function formatDispatchFailures(files: readonly string[]): string {
  const lines = [`dispatch_failed ${String(files.length)}`];
  for (const file of files) {
    lines.push(`dispatch_failed ${file}`, `::warning::pg_cron dispatch failed: ${file}`);
  }
  return lines.join('\n');
}
