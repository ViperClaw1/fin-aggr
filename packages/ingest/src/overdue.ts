import { pathToFileURL } from 'node:url';
import { databaseUrl, withClient } from './db';
import { listOverdue, type Sql } from './decisions';
import { loadLocalEnv } from './env';
import { commentOnIssue, issueNumberFromUrl } from './github';
import {
  formatNoIssue,
  formatOverdue,
  formatQueueCounts,
  OVERDUE_DAYS,
  overdueComment,
} from './policy';

export function cutoffIso(nowMs: number): string {
  return new Date(nowMs - OVERDUE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function mentionOverdue(
  sql: Sql,
  input: {
    cutoffIso: string;
    comment: (issueNumber: number, body: string) => Promise<void>;
    log: (line: string) => void;
  },
): Promise<void> {
  const open = await sql.query(`select id from review_queue where status = 'open'`);
  const overdue = await listOverdue(sql, input.cutoffIso);
  input.log(formatQueueCounts(open.rows.length, overdue.length));
  for (const row of overdue) {
    const issueNumber = row.issue_url === null ? null : issueNumberFromUrl(row.issue_url);
    if (issueNumber === null) {
      input.log(formatNoIssue(row.id));
      continue;
    }
    await input.comment(issueNumber, overdueComment(row.id));
    input.log(formatOverdue(row.id));
  }
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  loadLocalEnv();
  const token = process.env['REVIEW_REPO_TOKEN']?.trim() ?? '';
  if (token === '') {
    process.stderr.write('REVIEW_REPO_TOKEN is missing\n');
    process.exitCode = 1;
  } else {
    withClient(databaseUrl(process.env), (sql) =>
      mentionOverdue(sql, {
        cutoffIso: cutoffIso(Date.now()),
        comment: (issueNumber, body) => commentOnIssue(fetch, { token, issueNumber, body }),
        log: (line) => {
          process.stdout.write(`${line}\n`);
        },
      }),
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'review overdue failed';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
  }
}
