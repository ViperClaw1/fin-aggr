import { createHash } from 'node:crypto';
import {
  CodedError,
  guard,
  jobRecord,
  openFetch,
  stageOf,
  type FetchContext,
} from './fetch-budget';
import { reviewIssueBody } from './github';
import type { DatasetDomain } from './index';
import { formatIssueCreated } from './policy';
import { reportRevalidate, revalidateOrStatus } from './revalidate';
import { countGate, type ValidationReport } from './validate';

export type SourceKind = 'official_api' | 'scrape' | 'manual';

interface RawSnapshot<Raw> {
  sha256: string;
  bytes: Uint8Array;
  body: Raw;
  requestCount: number;
}

export interface Source<Raw, Parsed> {
  id: string;
  domain: DatasetDomain;
  kind: SourceKind;
  /** Per request. Default 30s. */
  requestTimeoutMs?: number;
  /** Whole `fetch`. Default 30s. */
  fetchBudgetMs?: number;
  fetch(ctx: FetchContext): Promise<RawSnapshot<Raw>>;
  parse(raw: Raw): Parsed[];
  validate(rows: Parsed[], previous: Parsed[]): ValidationReport<Parsed>;
}

interface JobRecord {
  sourceId: string;
  domain: DatasetDomain;
  startedAt: string;
  endedAt: string;
  status: 'published' | 'held' | 'failed';
  rowCount: number;
  errors: readonly (
    { code: string } | { stage: string; code: string } | { stage: 'revalidate'; status: number }
  )[];
  bytes: number;
  requestCount: number;
}

interface QueueInput {
  sourceId: string;
  domain: DatasetDomain;
  snapshotId: number;
  reason: string;
}

export interface PipelinePorts<Parsed> {
  now(): string;
  latestHash(sourceId: string): Promise<string | null>;
  /** `bytes` is the raw body. The port stores it in the private `raw` bucket. */
  saveSnapshot(input: { sourceId: string; sha256: string; bytes: Uint8Array }): Promise<{
    snapshotId: number;
  }>;
  previousRows(sourceId: string): Promise<Parsed[]>;
  /** Publish and the queue insert are one transaction (ADR-019). */
  commit(input: {
    publish: readonly Parsed[] | null;
    queue: QueueInput | null;
  }): Promise<{ queueId: number | null; versionId: number | null }>;
  sign(snapshotId: number): Promise<string>;
  openIssue(input: { title: string; body: string }): Promise<{ number: number; url: string }>;
  attachIssue(queueId: number, issueUrl: string): Promise<void>;
  finishJob(job: JobRecord): Promise<void>;
  revalidate(): Promise<void>;
  notifyFailure(message: string, title?: string): Promise<{ number: number } | null>;
}

export interface RunSummary {
  status: 'published' | 'held' | 'failed';
  published: number;
  queued: number;
  issueNumber: number | null;
  /** Current version written by this run. Null when nothing was published. */
  versionId: number | null;
  revalidateStatus: number | null;
  /** Set when the run threw. The message is not stored. */
  failure: { stage: string; code: string } | null;
}

const HASH = /^[0-9a-f]{64}$/;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** What the run may publish, and the single review reason for the batch. */
export function decidePublish<T>(input: {
  kind: SourceKind;
  clean: readonly T[];
  suspicious: ValidationReport<T>['suspicious'];
  blocked: string | null;
}): { publish: readonly T[] | null; reason: string | null } {
  if (input.blocked !== null) return { publish: null, reason: input.blocked };
  const reason = input.suspicious.map((row) => `${row.key}: ${row.reasons.join(', ')}`).join('; ');
  if (input.suspicious.length > 0 && input.kind !== 'scrape') {
    return { publish: null, reason };
  }
  if (input.suspicious.length > 0) {
    return { publish: input.clean.length > 0 ? input.clean : null, reason };
  }
  if (input.clean.length === 0) return { publish: null, reason: 'empty' };
  return { publish: input.clean, reason: null };
}

export async function runSource<Raw, Parsed>(
  source: Source<Raw, Parsed>,
  ports: PipelinePorts<Parsed>,
  log: (line: string) => void,
): Promise<RunSummary> {
  const startedAt = ports.now();
  try {
    return await runBody(source, ports, log, startedAt);
  } catch (error) {
    const failure = stageOf(error);
    await ports.finishJob({
      sourceId: source.id,
      domain: source.domain,
      startedAt,
      endedAt: ports.now(),
      status: 'failed',
      rowCount: 0,
      errors: [failure],
      bytes: 0,
      requestCount: 0,
    });
    const issue = await ports.notifyFailure(`${failure.stage} ${failure.code}`);
    if (issue !== null) log(formatIssueCreated(issue.number));
    return {
      status: 'failed',
      published: 0,
      queued: 0,
      issueNumber: issue?.number ?? null,
      versionId: null,
      revalidateStatus: null,
      failure,
    };
  }
}

async function runBody<Raw, Parsed>(
  source: Source<Raw, Parsed>,
  ports: PipelinePorts<Parsed>,
  log: (line: string) => void,
  startedAt: string,
): Promise<RunSummary> {
  const snapshot = await guard('fetch', () => source.fetch(openFetch(source)));
  await guard('hash', () => {
    if (!HASH.test(snapshot.sha256) || snapshot.sha256 !== sha256Hex(snapshot.bytes)) {
      throw new CodedError('hash');
    }
    return Promise.resolve();
  });
  const unchanged = await guard('hash', () => ports.latestHash(source.id));
  if (unchanged === snapshot.sha256) {
    await ports.finishJob(
      jobRecord({
        source,
        startedAt,
        endedAt: ports.now(),
        status: 'held',
        rowCount: 0,
        errors: ['unchanged'],
        bytes: 0,
        requestCount: 0,
      }),
    );
    return {
      status: 'held',
      published: 0,
      queued: 0,
      issueNumber: null,
      versionId: null,
      revalidateStatus: null,
      failure: null,
    };
  }
  return publishOrHold({ source, ports, log, startedAt }, snapshot);
}

async function publishOrHold<Raw, Parsed>(
  run: {
    source: Source<Raw, Parsed>;
    ports: PipelinePorts<Parsed>;
    log: (line: string) => void;
    startedAt: string;
  },
  snapshot: RawSnapshot<Raw>,
): Promise<RunSummary> {
  const { source, ports, log, startedAt } = run;
  const saved = await guard('snapshot', () =>
    ports.saveSnapshot({
      sourceId: source.id,
      sha256: snapshot.sha256,
      bytes: snapshot.bytes,
    }),
  );
  const parsed = await guard('parse', () => Promise.resolve(source.parse(snapshot.body)));
  const previous = await guard('previous', () => ports.previousRows(source.id));
  const report = await guard('validate', () => Promise.resolve(source.validate(parsed, previous)));
  const decision = decidePublish({
    kind: source.kind,
    clean: report.clean,
    suspicious: report.suspicious,
    blocked: report.blocked ?? countGate(parsed.length, previous.length),
  });
  const committed = await guard('commit', () =>
    ports.commit({
      publish: decision.publish,
      queue:
        decision.reason === null
          ? null
          : {
              sourceId: source.id,
              domain: source.domain,
              snapshotId: saved.snapshotId,
              reason: decision.reason,
            },
    }),
  );
  return finishRun({
    source,
    ports,
    log,
    startedAt,
    snapshot,
    decision,
    committed,
    snapshotId: saved.snapshotId,
    revalidateStatus:
      decision.publish === null ? null : await revalidateOrStatus(() => ports.revalidate()),
  });
}

async function finishRun<Raw, Parsed>(input: {
  source: Source<Raw, Parsed>;
  ports: PipelinePorts<Parsed>;
  log: (line: string) => void;
  startedAt: string;
  snapshot: RawSnapshot<Raw>;
  decision: { publish: readonly Parsed[] | null; reason: string | null };
  committed: { queueId: number | null; versionId: number | null };
  snapshotId: number;
  revalidateStatus: number | null;
}): Promise<RunSummary> {
  const { source, ports, log, startedAt, snapshot, decision, committed, revalidateStatus } = input;
  const issueNumber = await openBatchIssue(source, ports, log, {
    snapshotId: input.snapshotId,
    queueId: committed.queueId,
    reason: decision.reason,
  });
  const status = decision.publish === null ? 'held' : 'published';
  const record = jobRecord({
    source,
    startedAt,
    endedAt: ports.now(),
    status,
    rowCount: decision.publish?.length ?? 0,
    errors: issueNumber === null && decision.reason !== null ? ['issue_failed'] : [],
    bytes: snapshot.bytes.byteLength,
    requestCount: snapshot.requestCount,
  });
  const failureIssue =
    revalidateStatus === null
      ? issueNumber
      : await reportRevalidate(
          (message, title) => ports.notifyFailure(message, title),
          log,
          revalidateStatus,
        );
  if (revalidateStatus !== null)
    record.errors = [{ stage: 'revalidate', status: revalidateStatus }];
  await ports.finishJob(record);
  return {
    status,
    published: decision.publish?.length ?? 0,
    queued: committed.queueId === null ? 0 : 1,
    issueNumber: failureIssue,
    versionId: committed.versionId,
    revalidateStatus,
    failure: null,
  };
}
async function openBatchIssue<Parsed>(
  source: Source<unknown, Parsed>,
  ports: PipelinePorts<Parsed>,
  log: (line: string) => void,
  batch: { snapshotId: number; queueId: number | null; reason: string | null },
): Promise<number | null> {
  if (batch.queueId === null || batch.reason === null) return null;
  try {
    const signedUrl = await ports.sign(batch.snapshotId);
    const issue = await ports.openIssue({
      title: `Review ${source.id}`,
      body: reviewIssueBody({
        sourceId: source.id,
        domain: source.domain,
        queueId: batch.queueId,
        reason: batch.reason,
        signedUrl,
      }),
    });
    await ports.attachIssue(batch.queueId, issue.url);
    log(formatIssueCreated(issue.number));
    return issue.number;
  } catch {
    return null;
  }
}
