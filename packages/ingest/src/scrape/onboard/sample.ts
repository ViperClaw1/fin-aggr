import { pathToFileURL } from 'node:url';
import { databaseUrl, withClient } from '../../db';
import { enqueueReview, type Sql } from '../../decisions';
import { loadLocalEnv } from '../../env';
import { automatedBanks, sampleReason } from '../../postgres/adapter-configs';
import { sampleOf } from './policy';

/**
 * `pnpm ingest:sample` (ADR-026): once a week, 10% of the banks confirmed by the checks go to
 * the review queue as `sample_check:<template>`. Rejecting one stops that template.
 */

/** ISO week `2026-W48` of a UTC timestamp. */
export function isoWeek(at: string): string {
  const day = new Date(`${at.slice(0, 10)}T00:00:00Z`);
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday + 3);
  const year = day.getUTCFullYear();
  const week = 1 + Math.floor((day.getTime() - Date.UTC(year, 0, 1)) / 604800000);
  return `${String(year)}-W${String(week).padStart(2, '0')}`;
}

export async function queueSample(sql: Sql, at: string): Promise<string[]> {
  const banks = await automatedBanks(sql);
  const picked = new Set(
    sampleOf(
      banks.map((b) => b.sourceId),
      isoWeek(at),
    ),
  );
  for (const bank of banks.filter((b) => picked.has(b.sourceId))) {
    await enqueueReview(sql, {
      sourceId: bank.sourceId,
      domain: 'bank_products',
      snapshotId: bank.snapshotId,
      reason: sampleReason(bank.template),
    });
  }
  return [...picked];
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  loadLocalEnv();
  withClient(databaseUrl(process.env), (sql) => queueSample(sql, new Date().toISOString()))
    .then((ids) => {
      process.stdout.write(
        `sample week=${isoWeek(new Date().toISOString())} queued=${String(ids.length)} ${ids.join(' ')}\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : 'sample failed'}\n`);
      process.exitCode = 1;
    });
}
