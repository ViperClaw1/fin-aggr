import { CodedError, failureText, guard, jobRecord, openFetch, stageOf } from './fetch-budget';
import { formatIssueCreated } from './policy';
import { sha256Hex, type PipelinePorts, type RunSummary, type Source } from './pipeline';

export interface WatchSource<Raw, Parsed> extends Source<Raw, Parsed> {
  mode: 'watch';
  /** True when `next` differs from the previous snapshot in a way a person must see. */
  changed(previous: Uint8Array, next: Raw): boolean;
  /** Bytes to keep. A baseline passes `previous` as null. */
  persist(previous: Uint8Array | null, next: Raw): { sha256: string; bytes: Uint8Array };
  issueBody(previous: Uint8Array, next: Raw): string;
}

type WatchOutcome = 'unchanged' | 'baseline' | 'changed';

interface WatchRun<Raw, Parsed> {
  source: WatchSource<Raw, Parsed>;
  ports: PipelinePorts<Parsed>;
  startedAt: string;
}

/** Public log for a watch run. No title, date, or section id. */
export function formatWatchLine(id: string, outcome: WatchOutcome): string {
  if (outcome === 'changed') return `source ${id} changed queued=1`;
  return `source ${id} ${outcome}`;
}

/**
 * Fetch, store the content hash, parse, and compare with the previous snapshot.
 * A change queues one review and opens one issue. It does not validate or publish.
 */
export async function runWatchSource<Raw, Parsed>(
  source: WatchSource<Raw, Parsed>,
  ports: PipelinePorts<Parsed>,
  log: (line: string) => void,
): Promise<RunSummary> {
  const startedAt = ports.now();
  try {
    return await watchBody({ source, ports, startedAt });
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
    const issue = await ports.notifyFailure(failureText(failure));
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

async function watchBody<Raw, Parsed>(run: WatchRun<Raw, Parsed>): Promise<RunSummary> {
  const snapshot = await guard('fetch', () => run.source.fetch(openFetch(run.source)));
  await guard('hash', () => {
    if (snapshot.sha256 !== sha256Hex(snapshot.bytes)) throw new CodedError('hash');
    return Promise.resolve();
  });
  await guard('parse', () => Promise.resolve(run.source.parse(snapshot.body)));
  const previousHash = await guard('hash', () => run.ports.latestHash(run.source.id));
  if (previousHash === snapshot.sha256) {
    return finishWatch(run, { name: 'unchanged', requestCount: snapshot.requestCount });
  }
  const previous =
    previousHash === null
      ? null
      : await guard('snapshot', () => run.ports.previousSnapshot(run.source.id));
  if (previousHash !== null && previous === null) throw new CodedError('snapshot');
  if (previous !== null && !run.source.changed(previous, snapshot.body)) {
    return finishWatch(run, { name: 'unchanged', requestCount: snapshot.requestCount });
  }
  const stored = run.source.persist(previous, snapshot.body);
  if (stored.sha256 !== sha256Hex(stored.bytes)) throw new CodedError('hash');
  const saved = await guard('snapshot', () =>
    run.ports.saveSnapshot({
      sourceId: run.source.id,
      sha256: stored.sha256,
      bytes: stored.bytes,
    }),
  );
  if (previous === null) {
    return finishWatch(run, {
      name: 'baseline',
      requestCount: snapshot.requestCount,
      bytes: stored.bytes.byteLength,
    });
  }
  return queueChange(run, {
    body: snapshot.body,
    previous,
    snapshotId: saved.snapshotId,
    requestCount: snapshot.requestCount,
    bytes: stored.bytes.byteLength,
  });
}

async function queueChange<Raw, Parsed>(
  run: WatchRun<Raw, Parsed>,
  change: {
    body: Raw;
    previous: Uint8Array;
    snapshotId: number;
    requestCount: number;
    bytes: number;
  },
): Promise<RunSummary> {
  const committed = await guard('commit', () =>
    run.ports.commit({
      publish: null,
      queue: {
        sourceId: run.source.id,
        domain: run.source.domain,
        snapshotId: change.snapshotId,
        reason: 'changed',
      },
    }),
  );
  if (committed.queueId === null) throw new CodedError('queue');
  const issueNumber = await openWatchIssue(run, { ...change, queueId: committed.queueId });
  const errors = issueNumber === null ? ['issue_failed'] : [];
  return finishWatch(run, {
    name: 'changed',
    issueNumber,
    requestCount: change.requestCount,
    bytes: change.bytes,
    errors,
  });
}

async function openWatchIssue<Raw, Parsed>(
  run: WatchRun<Raw, Parsed>,
  change: { previous: Uint8Array; body: Raw; queueId: number },
): Promise<number | null> {
  try {
    const issue = await run.ports.openIssue({
      title: `Review ${run.source.id}`,
      body: `${run.source.issueBody(change.previous, change.body)}\nQueue: ${String(change.queueId)}`,
    });
    await run.ports.attachIssue(change.queueId, issue.url);
    return issue.number;
  } catch {
    return null;
  }
}

async function finishWatch<Raw, Parsed>(
  run: WatchRun<Raw, Parsed>,
  outcome: {
    name: WatchOutcome;
    issueNumber?: number | null;
    requestCount: number;
    bytes?: number;
    errors?: readonly string[];
  },
): Promise<RunSummary> {
  const errors = outcome.errors ?? [];
  await run.ports.finishJob(
    jobRecord({
      source: run.source,
      startedAt: run.startedAt,
      endedAt: run.ports.now(),
      status: 'held',
      rowCount: 0,
      errors: errors.length > 0 ? errors : [outcome.name],
      bytes: outcome.bytes ?? 0,
      requestCount: outcome.requestCount,
    }),
  );
  return {
    status: 'held',
    published: 0,
    queued: outcome.name === 'changed' ? 1 : 0,
    issueNumber: outcome.issueNumber ?? null,
    versionId: null,
    revalidateStatus: null,
    failure: null,
    watch: outcome.name,
  };
}
