import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { commandOf } from './args';
import { closeReviewIssue, issueNumberFromUrl, reopenReviewIssue } from './github';
import {
  approveRow,
  assertPublishEnv,
  defaultDeps,
  publishApproved,
  publishedLine,
  revalidateOrWarn,
  rowWithStatus,
  type CliDeps,
  type CliIo,
} from './approve';
import { listOpen, rejectReview, reopenReview, type OpenReview, type Sql } from './decisions';
import { loadLocalEnv } from './env';
import { requireReviewer, SIGNED_URL_SECONDS } from './policy';
import { RAW_BUCKET } from './scrape/rules';

export { PUBLISH_ENV, registerPublisher, revalidateWarning, type CliDeps } from './approve';

const execFileAsync = promisify(execFile);

export async function reviewerFrom(
  env: NodeJS.ProcessEnv,
  ghLogin: () => Promise<string>,
): Promise<string> {
  const fromEnv = env['FA_REVIEWER'];
  if (fromEnv !== undefined && fromEnv.trim() !== '') return requireReviewer(fromEnv);
  return requireReviewer(await ghLogin());
}

export function formatReviewRow(row: OpenReview): string {
  return `${String(row.id)} ${row.source_id} ${row.domain} ${row.reason}`;
}

export function formatDecision(
  id: number,
  decision: 'approved' | 'rejected' | 'reopened',
  login: string,
): string {
  return `review ${String(id)} ${decision} by ${login}`;
}

export function issueNotSynced(action: 'closed' | 'reopened'): string {
  return `REVIEW_REPO_TOKEN is missing; the issue was not ${action}`;
}

async function signedUrl(path: string, env: NodeJS.ProcessEnv): Promise<string> {
  const url = env['SUPABASE_URL']?.trim() ?? '';
  const key = env['SUPABASE_SECRET_KEY']?.trim() ?? '';
  if (url === '' || key === '') throw new Error('SUPABASE_URL or SUPABASE_SECRET_KEY is missing');
  const client = createClient(url, key, { auth: { persistSession: false } });
  const signed = await client.storage.from(RAW_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (signed.error !== null) throw new Error('signed url failed');
  return signed.data.signedUrl;
}

async function snapshotPath(sql: Sql, id: number): Promise<string> {
  const result = await sql.query(
    `select s.bucket_path
     from review_queue q
     join raw_snapshots s on s.id = q.snapshot_id
     where q.id = $1`,
    [id],
  );
  const path = result.rows[0]?.['bucket_path'];
  if (typeof path !== 'string') throw new Error('snapshot is missing');
  return path;
}

function openRow(sql: Sql, id: number): Promise<OpenReview> {
  return rowWithStatus(sql, id, 'open');
}

export async function runCommand(
  env: NodeJS.ProcessEnv,
  argv: readonly string[],
  io: CliIo,
  deps: CliDeps = defaultDeps(env),
): Promise<void> {
  const command = commandOf(argv);
  if (command.kind === 'revalidate') {
    await deps.revalidate(command.domain);
    io.log(`revalidated ${command.domain}`);
    return;
  }
  if (command.kind === 'approve' || command.kind === 'publish-approved') {
    assertPublishEnv(env);
  }
  if (command.kind === 'publish-approved') {
    await publishApproved(command.id, io, deps);
    return;
  }
  await deps.withSql(async (sql) => {
    if (command.kind === 'review') {
      if (command.id === null) {
        const rows = await listOpen(sql);
        for (const row of rows) io.log(formatReviewRow(row));
        return;
      }
      io.log(await signedUrl(await snapshotPath(sql, command.id), env));
      return;
    }
    const login = await reviewerFrom(env, io.ghLogin);
    if (command.kind === 'reopen') {
      await reopenCommand(sql, command, login, { ...io, env });
      return;
    }
    const row = await openRow(sql, command.id);
    if (command.kind === 'reject') {
      const reason = command.reason ?? '';
      await rejectReview(sql, {
        id: command.id,
        login,
        decidedAt: io.now(),
        reason,
      });
      io.log(formatDecision(command.id, 'rejected', login));
      await syncPrivateIssue(
        env,
        {
          issueUrl: row.issue_url,
          body: `rejected by ${login}: ${reason.trim()}`,
          action: 'closed',
        },
        io.warn,
      );
      return;
    }
    const { planned, versionId } = await approveRow({
      sql,
      row,
      login,
      io,
      deps,
      minutes: command.minutes,
    });
    io.log(formatDecision(command.id, 'approved', login));
    if (planned) io.log(publishedLine(command.id, versionId));
    await revalidateOrWarn(deps, row.domain, io.warn);
    await syncPrivateIssue(
      env,
      { issueUrl: row.issue_url, body: `approved by ${login}`, action: 'closed' },
      io.warn,
    );
  });
}

async function reopenCommand(
  sql: Sql,
  command: { id: number; reason: string | undefined },
  login: string,
  io: {
    env: NodeJS.ProcessEnv;
    log: (line: string) => void;
    warn: (line: string) => void;
    now: () => string;
  },
): Promise<void> {
  const reason = command.reason ?? '';
  const reopened = await reopenReview(sql, {
    id: command.id,
    login,
    reopenedAt: io.now(),
    reason,
  });
  io.log(formatDecision(command.id, 'reopened', login));
  await syncPrivateIssue(
    io.env,
    {
      issueUrl: reopened.issueUrl,
      body: `reopened by ${login}: ${reason.trim()}`,
      action: 'reopened',
    },
    io.warn,
  );
}

/** Closes or reopens the private issue. A missing token warns and does not fail the decision. */
export async function syncPrivateIssue(
  env: NodeJS.ProcessEnv,
  input: { issueUrl: string | null; body: string; action: 'closed' | 'reopened' },
  warn: (line: string) => void,
): Promise<void> {
  if (input.issueUrl === null) return;
  const issueNumber = issueNumberFromUrl(input.issueUrl);
  if (issueNumber === null) return;
  const token = env['REVIEW_REPO_TOKEN']?.trim() ?? '';
  if (token === '') {
    warn(issueNotSynced(input.action));
    return;
  }
  const request = { token, issueNumber, body: input.body };
  if (input.action === 'closed') await closeReviewIssue(fetch, request);
  else await reopenReviewIssue(fetch, request);
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  loadLocalEnv();
  runCommand(process.env, process.argv.slice(2), {
    log: (line) => {
      process.stdout.write(`${line}\n`);
    },
    warn: (line) => {
      process.stderr.write(`${line}\n`);
    },
    ghLogin: async () => (await execFileAsync('gh', ['api', 'user', '--jq', '.login'])).stdout,
    now: () => new Date().toISOString(),
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'ingest review failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
