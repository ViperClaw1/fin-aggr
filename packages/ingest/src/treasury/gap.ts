import { CodedError, failureText, guard, jobRecord, openFetch, stageOf } from '../fetch-budget';
import { openQueuedIssue } from '../github';
import type { DatasetDomain } from '../index';
import { formatIssueCreated } from '../policy';
import type { PipelinePorts, RunSummary } from '../pipeline';
import { missingFieldsReason } from './product-gaps';
import {
  DIRECT_URL,
  FISCAL_URL,
  directShapeProblems,
  fetchAuctionBody,
  fiscalShapeProblems,
} from './auctions';

interface GapSource {
  id: string;
  domain: DatasetDomain;
  url: string;
  problems(body: string): string[];
}

const FISCAL: GapSource = {
  id: 'treasury-fiscal-data',
  domain: 'treasury',
  url: FISCAL_URL,
  problems: fiscalShapeProblems,
};

const DIRECT: GapSource = {
  id: 'treasurydirect',
  domain: 'treasury',
  url: DIRECT_URL,
  problems: directShapeProblems,
};

function held(reason: string, published = 0): RunSummary {
  return {
    status: 'held',
    published,
    queued: 0,
    issueNumber: null,
    versionId: null,
    revalidateStatus: null,
    failure: null,
    holdReason: reason,
  };
}

/**
 * Official columns are stored. Product fields the schema requires are absent,
 * so nothing is published. A changed snapshot updates the one open review.
 */
export async function runAuctionGap(
  source: GapSource,
  ports: PipelinePorts<never>,
  log: (line: string) => void,
): Promise<RunSummary> {
  const startedAt = ports.now();
  try {
    const snapshot = await guard('fetch', () =>
      fetchAuctionBody({
        fetchImpl: fetch,
        requestSignal: () => openFetch({ requestTimeoutMs: 30_000 }).requestSignal(),
        url: source.url,
      }),
    );
    const problems = source.problems(snapshot.body);
    if (problems.length > 0) throw new CodedError(problems[0] ?? 'shape');
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
      return held('unchanged');
    }
    const saved = await guard('snapshot', () =>
      ports.saveSnapshot({ sourceId: source.id, sha256: snapshot.sha256, bytes: snapshot.bytes }),
    );
    return await holdMissingFields({
      source,
      ports,
      log,
      startedAt,
      snapshotId: saved.snapshotId,
      bytes: snapshot.bytes.byteLength,
      requestCount: snapshot.requestCount,
    });
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

async function holdMissingFields(input: {
  source: GapSource;
  ports: PipelinePorts<never>;
  log: (line: string) => void;
  startedAt: string;
  snapshotId: number;
  bytes: number;
  requestCount: number;
}): Promise<RunSummary> {
  const { source, ports, log, startedAt, snapshotId } = input;
  const reason = missingFieldsReason();
  const committed = await guard('commit', () =>
    ports.commit({
      publish: null,
      queue: { sourceId: source.id, domain: source.domain, snapshotId, reason },
    }),
  );
  const issueNumber = await openQueuedIssue(source, ports, log, {
    snapshotId,
    queueId: committed.queueId,
    reason,
    issueUrl: committed.issueUrl ?? null,
  });
  await ports.finishJob(
    jobRecord({
      source,
      startedAt,
      endedAt: ports.now(),
      status: 'held',
      rowCount: 0,
      errors: ['missing_fields'],
      bytes: input.bytes,
      requestCount: input.requestCount,
    }),
  );
  return {
    ...held(reason),
    queued: committed.queueId === null ? 0 : 1,
    issueNumber,
  };
}

export function fiscalGap(): GapSource {
  return FISCAL;
}

export function directGap(): GapSource {
  return DIRECT;
}
