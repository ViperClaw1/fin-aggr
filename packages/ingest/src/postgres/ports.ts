import { createClient } from '@supabase/supabase-js';
import type { Institution as InstitutionRow } from '@fa/contracts';
import { revalidateDomain } from '../cli';
import { databaseUrl, withClient } from '../db';
import type { Sql } from '../decisions';
import { createReviewIssue } from '../github';
import type { PipelinePorts } from '../pipeline';
import { SIGNED_URL_SECONDS } from '../policy';
import { RAW_BUCKET } from '../scrape/rules';
import {
  commitInstitutions,
  ensureFdicSource,
  insertSnapshot,
  latestSnapshotHash,
  previousInstitutions,
} from './institutions';

export async function prepareFdicSource(env: NodeJS.ProcessEnv): Promise<void> {
  await withClient(databaseUrl(env), ensureFdicSource);
}

function storageClient(env: NodeJS.ProcessEnv) {
  const url = env['SUPABASE_URL']?.trim() ?? '';
  const key = env['SUPABASE_SECRET_KEY']?.trim() ?? '';
  if (url === '' || key === '') throw new Error('SUPABASE_URL or SUPABASE_SECRET_KEY is missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function uploadRaw(env: NodeJS.ProcessEnv, path: string, bytes: Uint8Array): Promise<void> {
  const uploaded = await storageClient(env)
    .storage.from(RAW_BUCKET)
    .upload(path, Buffer.from(bytes), { contentType: 'application/json', upsert: true });
  if (uploaded.error !== null) throw new Error('raw snapshot upload failed');
}

async function signedRawUrl(env: NodeJS.ProcessEnv, path: string): Promise<string> {
  const signed = await storageClient(env)
    .storage.from(RAW_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (signed.error !== null) throw new Error('signed url failed');
  return signed.data.signedUrl;
}

function reviewToken(env: NodeJS.ProcessEnv): string {
  return env['REVIEW_REPO_TOKEN']?.trim() ?? '';
}

/** Ports for the FDIC institutions source. Each call opens its own connection. */
export function institutionPorts(
  env: NodeJS.ProcessEnv,
  now: () => string,
): PipelinePorts<InstitutionRow> {
  return {
    now,
    latestHash: (sourceId) =>
      withClient(databaseUrl(env), (sql) => latestSnapshotHash(sql, sourceId)),
    saveSnapshot: (input) => saveInstitutionSnapshot(env, input),
    previousRows: () => withClient(databaseUrl(env), previousInstitutions),
    commit: (input) =>
      withClient(databaseUrl(env), (sql) => commitInstitutions(sql, { ...input, asOf: now() })),
    sign: (snapshotId) => signSnapshot(env, snapshotId),
    openIssue: (input) => openReview(env, input),
    attachIssue: (queueId, issueUrl) =>
      withClient(databaseUrl(env), (sql) => attachIssue(sql, queueId, issueUrl)),
    finishJob: (job) => withClient(databaseUrl(env), (sql) => finishJob(sql, job)),
    revalidate: () => revalidateDomain(env, 'institutions'),
    notifyFailure: (message, title) => notifyFailure(env, message, title),
  };
}

async function saveInstitutionSnapshot(
  env: NodeJS.ProcessEnv,
  input: { sourceId: string; sha256: string; bytes: Uint8Array },
): Promise<{ snapshotId: number }> {
  const bucketPath = `${input.sourceId}/${input.sha256}.json`;
  await uploadRaw(env, bucketPath, input.bytes);
  const snapshotId = await withClient(databaseUrl(env), (sql) =>
    insertSnapshot(sql, {
      sourceId: input.sourceId,
      sha256: input.sha256,
      bucketPath,
      bytes: input.bytes.byteLength,
    }),
  );
  return { snapshotId };
}

async function signSnapshot(env: NodeJS.ProcessEnv, snapshotId: number): Promise<string> {
  const path = await withClient(databaseUrl(env), async (sql) => {
    const result = await sql.query(`select bucket_path from raw_snapshots where id = $1`, [
      snapshotId,
    ]);
    const bucketPath = result.rows[0]?.['bucket_path'];
    if (typeof bucketPath !== 'string') throw new Error('snapshot is missing');
    return bucketPath;
  });
  return signedRawUrl(env, path);
}

async function openReview(
  env: NodeJS.ProcessEnv,
  input: { title: string; body: string },
): Promise<{ number: number; url: string }> {
  const token = reviewToken(env);
  if (token === '') throw new Error('REVIEW_REPO_TOKEN is missing');
  return createReviewIssue(fetch, { token, title: input.title, body: input.body });
}

async function attachIssue(sql: Sql, queueId: number, issueUrl: string): Promise<void> {
  await sql.query(`update review_queue set issue_url = $2 where id = $1`, [queueId, issueUrl]);
}

async function finishJob(
  sql: Sql,
  job: Parameters<PipelinePorts<InstitutionRow>['finishJob']>[0],
): Promise<void> {
  await sql.query(
    `insert into job_runs (
       source_id, domain, started_at, ended_at, status, row_count, errors, bytes, request_count
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
    [
      job.sourceId,
      job.domain,
      job.startedAt,
      job.endedAt,
      job.status,
      job.rowCount,
      JSON.stringify(job.errors),
      job.bytes,
      job.requestCount,
    ],
  );
}

async function notifyFailure(
  env: NodeJS.ProcessEnv,
  message: string,
  title = 'Ingest fdic-institutions failed',
): Promise<{ number: number } | null> {
  const token = reviewToken(env);
  if (token === '') return null;
  const issue = await createReviewIssue(fetch, { token, title, body: message });
  return { number: issue.number };
}
