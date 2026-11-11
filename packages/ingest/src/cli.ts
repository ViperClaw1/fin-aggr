import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { commandOf } from './args';
import { databaseUrl, withClient } from './db';
import {
  approveReview,
  listOpen,
  openReview,
  rejectReview,
  type OpenReview,
  type Sql,
} from './decisions';
import { loadLocalEnv } from './env';
import { requireReviewer, SIGNED_URL_SECONDS } from './policy';
import { RAW_BUCKET } from './scrape/rules';

const execFileAsync = promisify(execFile);

type Publisher = (sql: Sql, row: OpenReview) => Promise<void>;

const publishers = new Map<string, Publisher>();

/** Step 6 registers the parser that turns a held snapshot into a version. */
export function registerPublisher(sourceId: string, publish: Publisher): void {
  publishers.set(sourceId, publish);
}

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

export async function revalidateDomain(env: NodeJS.ProcessEnv, domain: string): Promise<void> {
  const configured = env['NEXT_PUBLIC_SITE_URL']?.trim() ?? '';
  const origin = (configured === '' ? 'https://fin-aggr.vercel.app' : configured).replace(
    /\/$/,
    '',
  );
  const secret = env['REVALIDATE_SECRET']?.trim() ?? '';
  if (secret === '') throw new Error('REVALIDATE_SECRET is missing');
  const response = await fetch(`${origin}/api/revalidate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({ domain }),
  });
  if (!response.ok) throw new Error(`revalidate failed: ${String(response.status)}`);
}

async function openRow(sql: Sql, id: number): Promise<OpenReview> {
  const result = await sql.query(
    `select id, source_id, domain, reason, snapshot_id
     from review_queue where id = $1 and status = 'open'`,
    [id],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error(`review ${String(id)} is not open`);
  return openReview(row);
}

export async function runCommand(
  env: NodeJS.ProcessEnv,
  argv: readonly string[],
  io: { log: (line: string) => void; ghLogin: () => Promise<string>; now: () => string },
): Promise<void> {
  const command = commandOf(argv);
  await withClient(databaseUrl(env), async (sql) => {
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
    const row = await openRow(sql, command.id);
    if (command.kind === 'reject') {
      await rejectReview(sql, {
        id: command.id,
        login,
        decidedAt: io.now(),
        reason: command.reason ?? '',
      });
      return;
    }
    const publish = publishers.get(row.source_id);
    if (publish === undefined) {
      throw new Error(`No held publisher is registered for ${row.source_id}`);
    }
    await approveReview(sql, {
      id: command.id,
      login,
      decidedAt: io.now(),
      publish: (tx) => publish(tx, row),
    });
    await revalidateDomain(env, row.domain);
  });
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
    ghLogin: async () => (await execFileAsync('gh', ['api', 'user', '--jq', '.login'])).stdout,
    now: () => new Date().toISOString(),
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'ingest review failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
