import { revalidateDomain } from '../cli';
import { databaseUrl, withClient } from '../db';
import type { Sql } from '../decisions';
import type { NationalRate } from '../fred/national';
import type { NcuaRow } from '../ncua/parse';
import type { PipelinePorts } from '../pipeline';
import { previousFinancials } from './financials';
import { latestSnapshotHash, previousInstitutions } from './institutions';
import { commitNationalRates, previousNationalRates } from './national';
import { commitNcua } from './ncua';
import {
  attachIssue,
  commentReview,
  finishJob,
  notifyFailure,
  openReview,
  previousSnapshotBytes,
  saveInstitutionSnapshot,
  signSnapshot,
} from './ports';

async function previousNcuaRows(sql: Sql): Promise<NcuaRow[]> {
  const institutions = await previousInstitutions(sql, 'ncua:');
  const reports = await previousFinancials(sql, 'ncua:');
  const byId = new Map(reports.map((row) => [row.report.institutionId, row]));
  return institutions.map((institution) => ({
    institution,
    report: byId.get(institution.id) ?? null,
  }));
}

/** One run publishes the directory and the call reports. Revalidate covers both. */
export function ncuaPorts(env: NodeJS.ProcessEnv, now: () => string): PipelinePorts<NcuaRow> {
  return {
    now,
    latestHash: (sourceId) =>
      withClient(databaseUrl(env), (sql) => latestSnapshotHash(sql, sourceId)),
    previousSnapshot: (sourceId) => previousSnapshotBytes(env, sourceId),
    saveSnapshot: (input) => saveInstitutionSnapshot(env, input),
    previousRows: () => withClient(databaseUrl(env), previousNcuaRows),
    commit: (input) =>
      withClient(databaseUrl(env), (sql) => commitNcua(sql, { ...input, asOf: now() })),
    sign: (snapshotId) => signSnapshot(env, snapshotId),
    openIssue: (input) => openReview(env, input),
    commentIssue: (input) => commentReview(env, input),
    attachIssue: (queueId, issueUrl) =>
      withClient(databaseUrl(env), (sql) => attachIssue(sql, queueId, issueUrl)),
    finishJob: (job) => withClient(databaseUrl(env), (sql) => finishJob(sql, job)),
    revalidate: async () => {
      await revalidateDomain(env, 'institutions');
      await revalidateDomain(env, 'bank_metrics');
    },
    notifyFailure: (message, title = 'Ingest ncua-5300 failed') =>
      notifyFailure(env, message, title),
  };
}

/** Publishes national rates as their own version. */
export function nationalRatesPorts(
  env: NodeJS.ProcessEnv,
  now: () => string,
): PipelinePorts<NationalRate> {
  return {
    now,
    latestHash: (sourceId) =>
      withClient(databaseUrl(env), (sql) => latestSnapshotHash(sql, sourceId)),
    previousSnapshot: (sourceId) => previousSnapshotBytes(env, sourceId),
    saveSnapshot: (input) => saveInstitutionSnapshot(env, input),
    previousRows: () => withClient(databaseUrl(env), previousNationalRates),
    commit: (input) => withClient(databaseUrl(env), (sql) => commitNationalRates(sql, input)),
    sign: (snapshotId) => signSnapshot(env, snapshotId),
    openIssue: (input) => openReview(env, input),
    commentIssue: (input) => commentReview(env, input),
    attachIssue: (queueId, issueUrl) =>
      withClient(databaseUrl(env), (sql) => attachIssue(sql, queueId, issueUrl)),
    finishJob: (job) => withClient(databaseUrl(env), (sql) => finishJob(sql, job)),
    revalidate: () => revalidateDomain(env, 'national_rates'),
    notifyFailure: (message, title = 'Ingest fdic-national-rates failed') =>
      notifyFailure(env, message, title),
  };
}

/** Snapshot ports for an auction feed that does not publish products. */
export function auctionPorts(env: NodeJS.ProcessEnv, now: () => string): PipelinePorts<never> {
  return {
    now,
    latestHash: (sourceId) =>
      withClient(databaseUrl(env), (sql) => latestSnapshotHash(sql, sourceId)),
    previousSnapshot: (sourceId) => previousSnapshotBytes(env, sourceId),
    saveSnapshot: (input) => saveInstitutionSnapshot(env, input),
    previousRows: () => Promise.resolve([]),
    commit: () => Promise.reject(new Error('treasury auctions do not publish products')),
    sign: (snapshotId) => signSnapshot(env, snapshotId),
    openIssue: (input) => openReview(env, input),
    commentIssue: (input) => commentReview(env, input),
    attachIssue: (queueId, issueUrl) =>
      withClient(databaseUrl(env), (sql) => attachIssue(sql, queueId, issueUrl)),
    finishJob: (job) => withClient(databaseUrl(env), (sql) => finishJob(sql, job)),
    revalidate: () => Promise.reject(new Error('treasury auctions do not revalidate')),
    notifyFailure: (message, title = 'Ingest treasury auctions failed') =>
      notifyFailure(env, message, title),
  };
}
