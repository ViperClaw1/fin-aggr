import { formatIssueCreated } from './policy';
import type { Sql } from './decisions';
import type { DatasetDomain } from './index';

/** A source outage. Our own parse, database, and schema errors are not in this set. */
function isUpstreamOutage(code: string): boolean {
  return code === 'TimeoutError' || code === 'AbortError' || /^http_5\d\d$/.test(code);
}

function upstreamReason(code: string): string | undefined {
  return isUpstreamOutage(code) ? `upstream_unavailable:${code}` : undefined;
}

/** An outage opens an issue on the third consecutive failed run. Our errors open on the first. */
function openAfterStreak(code: string, consecutiveUpstream: number): boolean {
  if (!isUpstreamOutage(code)) return true;
  return consecutiveUpstream >= 3;
}

export async function recordFailure(
  ports: {
    now(): string;
    finishJob(job: {
      sourceId: string;
      domain: DatasetDomain;
      startedAt: string;
      endedAt: string;
      status: 'failed';
      rowCount: number;
      errors: { stage: string; code: string; agency?: string }[];
      bytes: number;
      requestCount: number;
    }): Promise<void>;
    notifyFailure(
      message: string,
      title?: string,
    ): Promise<{ number: number; created?: boolean } | null>;
    failureStreak?: (sourceId: string) => Promise<number>;
  },
  input: {
    sourceId: string;
    domain: DatasetDomain;
    startedAt: string;
    failure: { stage: string; code: string; agency?: string };
    log: (line: string) => void;
  },
): Promise<{ issueNumber: number | null; holdReason: string | undefined }> {
  const { failure } = input;
  await ports.finishJob({
    sourceId: input.sourceId,
    domain: input.domain,
    startedAt: input.startedAt,
    endedAt: ports.now(),
    status: 'failed',
    rowCount: 0,
    errors: [failure],
    bytes: 0,
    requestCount: 0,
  });
  const holdReason = upstreamReason(failure.code);
  const streak = ports.failureStreak === undefined ? 3 : await ports.failureStreak(input.sourceId);
  if (!openAfterStreak(failure.code, streak)) {
    return { issueNumber: null, holdReason };
  }
  const issue = await ports.notifyFailure(
    `${ports.now()} ${failure.code}${failure.agency === undefined || failure.agency === '' ? '' : ` ${failure.agency}`}`,
    `Ingest ${input.sourceId} failed`,
  );
  if (issue !== null && issue.created !== false) input.log(formatIssueCreated(issue.number));
  return { issueNumber: issue?.number ?? null, holdReason };
}

export async function upstreamStreak(sql: Sql, sourceId: string): Promise<number> {
  const result = await sql.query(
    `select status, errors from job_runs where source_id = $1 order by ended_at desc limit 3`,
    [sourceId],
  );
  let count = 0;
  for (const row of result.rows) {
    if (row['status'] !== 'failed' || !upstreamRow(row['errors'])) break;
    count += 1;
  }
  return count;
}

function upstreamRow(errors: unknown): boolean {
  if (!Array.isArray(errors) || errors.length === 0) return false;
  return errors.every((item: unknown) => {
    const code = rowCode(item);
    return code !== null && isUpstreamOutage(code);
  });
}

function rowCode(item: unknown): string | null {
  if (typeof item === 'string') return item;
  if (typeof item !== 'object' || item === null || !('code' in item)) return null;
  return typeof item.code === 'string' ? item.code : null;
}
