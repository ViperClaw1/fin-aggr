import { createHash } from 'node:crypto';
import { reviewIssueBody } from './github';
import type { DatasetDomain } from './index';
import { formatIssueCreated } from './policy';
import { countGate, type ValidationReport } from './validate';

export type { ValidationReport } from './validate';

export type SourceKind = 'official_api' | 'scrape' | 'manual';

interface FetchContext {
  signal: AbortSignal;
}

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
  errors: readonly { code: string }[];
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
  notifyFailure(message: string): Promise<{ number: number } | null>;
}

export interface RunSummary {
  status: 'published' | 'held' | 'failed';
  published: number;
  queued: number;
  issueNumber: number | null;
  /** Current version written by this run. Null when nothing was published. */
  versionId: number | null;
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
    const message = error instanceof Error ? error.message : 'ingest failed';
    await ports.finishJob({
      sourceId: source.id,
      domain: source.domain,
      startedAt,
      endedAt: ports.now(),
      status: 'failed',
      rowCount: 0,
      errors: [{ code: 'failed' }],
      bytes: 0,
      requestCount: 0,
    });
    const issue = await ports.notifyFailure(message);
    if (issue !== null) log(formatIssueCreated(issue.number));
    return {
      status: 'failed',
      published: 0,
      queued: 0,
      issueNumber: issue?.number ?? null,
      versionId: null,
    };
  }
}

async function runBody<Raw, Parsed>(
  source: Source<Raw, Parsed>,
  ports: PipelinePorts<Parsed>,
  log: (line: string) => void,
  startedAt: string,
): Promise<RunSummary> {
  const snapshot = await source.fetch({ signal: AbortSignal.timeout(30_000) });
  if (!HASH.test(snapshot.sha256) || snapshot.sha256 !== sha256Hex(snapshot.bytes)) {
    throw new Error('snapshot hash does not match the body');
  }
  if ((await ports.latestHash(source.id)) === snapshot.sha256) {
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
    return { status: 'held', published: 0, queued: 0, issueNumber: null, versionId: null };
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
  const saved = await ports.saveSnapshot({
    sourceId: source.id,
    sha256: snapshot.sha256,
    bytes: snapshot.bytes,
  });
  const parsed = source.parse(snapshot.body);
  const previous = await ports.previousRows(source.id);
  const report = source.validate(parsed, previous);
  const decision = decidePublish({
    kind: source.kind,
    clean: report.clean,
    suspicious: report.suspicious,
    blocked: report.blocked ?? countGate(parsed.length, previous.length),
  });
  const committed = await ports.commit({
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
  });
  if (decision.publish !== null) await ports.revalidate();
  const issueNumber = await openBatchIssue(source, ports, log, {
    snapshotId: saved.snapshotId,
    queueId: committed.queueId,
    reason: decision.reason,
  });
  const status = decision.publish === null ? 'held' : 'published';
  const errors = issueNumber === null && decision.reason !== null ? ['issue_failed'] : [];
  await ports.finishJob(
    jobRecord({
      source,
      startedAt,
      endedAt: ports.now(),
      status,
      rowCount: decision.publish?.length ?? 0,
      errors,
      bytes: snapshot.bytes.byteLength,
      requestCount: snapshot.requestCount,
    }),
  );
  return {
    status,
    published: decision.publish?.length ?? 0,
    queued: committed.queueId === null ? 0 : 1,
    issueNumber,
    versionId: committed.versionId,
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

function jobRecord(input: {
  source: { id: string; domain: DatasetDomain };
  startedAt: string;
  endedAt: string;
  status: JobRecord['status'];
  rowCount: number;
  errors: readonly string[];
  bytes: number;
  requestCount: number;
}): JobRecord {
  return {
    sourceId: input.source.id,
    domain: input.source.domain,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    status: input.status,
    rowCount: input.rowCount,
    errors: input.errors.map((code) => ({ code })),
    bytes: input.bytes,
    requestCount: input.requestCount,
  };
}
