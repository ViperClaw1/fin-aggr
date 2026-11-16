import type { Product } from '@fa/contracts';
import { decidePublish } from '../../pipeline';
import { countGate } from '../../validate';
import type { PageRequest, PageResult, ScrapeClient } from '../session';
import { formatManual, overnightWindowStart, type ManualReason } from '../rules';
import { reviewBankProducts } from './review';
import { verifiedByHuman, type BankExtract } from './normalize';

export interface BankPorts {
  confirmation(): Promise<{ confirmed: false } | { confirmed: true; verifiedAt: string }>;
  previous(): Promise<readonly Product[]>;
  saveSnapshot(bytes: Uint8Array): Promise<number>;
  commit(input: {
    institutionId: string;
    publish: readonly Product[] | null;
    heldIds: readonly string[];
    queue: { sourceId: string; domain: string; snapshotId: number; reason: string } | null;
  }): Promise<{ versionId: number | null; queueId: number | null }>;
  markManual(reason: ManualReason): Promise<void>;
  /** A prior `job_runs` row with `request_count > 0` since this window opened. */
  requestedSince(windowStart: string): Promise<boolean>;
  finishJob(job: BankJobWrite): Promise<void>;
}

interface BankJobWrite {
  startedAt: string;
  endedAt: string;
  status: 'published' | 'held';
  rowCount: number;
  errors: readonly { code: string }[];
  bytes: number;
  requestCount: number;
}

interface BankRun {
  client: ScrapeClient;
  request: PageRequest;
  institutionId: string;
  retrievedDay: string;
  read: (text: string) => BankExtract;
  ports: BankPorts;
  log: (line: string) => void;
  now(): string;
}

function textOf(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}

/**
 * One page through the scrape session.
 * A manual result publishes nothing. The session already recorded that reason.
 * An adapter throw is manual `adapter` and also publishes nothing.
 */
export async function runBankPage(input: BankRun): Promise<void> {
  const startedAt = input.now();
  if (input.request.excluded) {
    await input.client.get(input.request);
    return;
  }
  const skip = await skipReason(input, startedAt);
  if (skip !== null) {
    await holdWithoutRequest(input, skip, startedAt);
    return;
  }
  await publishPage(input, startedAt);
}

async function skipReason(
  input: BankRun,
  startedAt: string,
): Promise<'outside_window' | 'already_fetched' | null> {
  const windowStart = overnightWindowStart(startedAt, input.request.timeZone);
  if (windowStart === null) return 'outside_window';
  if (await input.ports.requestedSince(windowStart)) return 'already_fetched';
  return null;
}

async function publishPage(input: BankRun, startedAt: string): Promise<void> {
  const page = await input.client.get(input.request);
  if (page.kind !== 'ok') {
    await noteIdle(input, page, startedAt);
    return;
  }
  let extracted: BankExtract;
  try {
    extracted = input.read(textOf(page.body));
  } catch {
    await stopAdapter(input);
    await writeJob(input, {
      startedAt,
      status: 'held',
      rowCount: 0,
      errors: [{ code: 'adapter' }],
      bytes: page.body.byteLength,
      requestCount: 1,
    });
    return;
  }
  const confirmation = await input.ports.confirmation();
  const previous = await input.ports.previous();
  const report = reviewBankProducts({
    rows: extracted.products,
    previous,
    confirmed: confirmation.confirmed,
    retrievedDay: input.retrievedDay,
  });
  const extra = extracted.extra.map((row) =>
    confirmation.confirmed ? row : { key: row.key, reasons: ['first_connection'] },
  );
  const suspicious = [...report.suspicious, ...extra];
  const clean = confirmation.confirmed
    ? report.clean.map((row) => verifiedByHuman(row, confirmation.verifiedAt))
    : report.clean;
  const blocked = report.blocked ?? countGate(extracted.products.length, previous.length);
  const decision = decidePublish({
    kind: 'scrape',
    clean,
    suspicious,
    blocked,
  });
  await storeDecision(input, startedAt, {
    body: page.body,
    decision,
    heldIds: suspicious.map((row) => row.key),
  });
}

async function storeDecision(
  input: BankRun,
  startedAt: string,
  stored: {
    body: Uint8Array;
    decision: { publish: readonly Product[] | null; reason: string | null };
    heldIds: readonly string[];
  },
): Promise<void> {
  const { body, decision, heldIds } = stored;
  const snapshotId = await input.ports.saveSnapshot(body);
  const committed = await input.ports.commit({
    institutionId: input.institutionId,
    publish: decision.publish,
    heldIds,
    queue:
      decision.reason === null
        ? null
        : {
            sourceId: input.request.sourceId,
            domain: 'bank_products',
            snapshotId,
            reason: decision.reason,
          },
  });
  const status = decision.publish === null ? 'held' : 'published';
  const version = committed.versionId === null ? '-' : String(committed.versionId);
  const reason = decision.reason === null ? '' : ` reason=${decision.reason}`;
  input.log(
    `source ${input.request.sourceId} ${status} rows=${String(decision.publish?.length ?? 0)} queued=${committed.queueId === null ? '0' : '1'} version=${version}${reason}`,
  );
  await writeJob(input, {
    startedAt,
    status,
    rowCount: decision.publish?.length ?? 0,
    errors: [],
    bytes: body.byteLength,
    requestCount: 1,
  });
}

async function stopAdapter(input: {
  request: PageRequest;
  ports: BankPorts;
  log: (line: string) => void;
}): Promise<void> {
  input.log(formatManual(input.request.sourceId, 'adapter'));
  await input.ports.markManual('adapter');
}

function holdLine(sourceId: string, reason: string): string {
  return `source ${sourceId} held reason=${reason}`;
}

async function writeJob(input: BankRun, job: Omit<BankJobWrite, 'endedAt'>): Promise<void> {
  await input.ports.finishJob({ ...job, endedAt: input.now() });
}

/** A skip still leaves a log line and a `job_runs` row. `request_count` stays 0, so it is not a fetch. */
async function holdWithoutRequest(
  input: BankRun,
  reason: 'outside_window' | 'already_fetched',
  startedAt: string,
): Promise<void> {
  input.log(holdLine(input.request.sourceId, reason));
  await writeJob(input, {
    startedAt,
    status: 'held',
    rowCount: 0,
    errors: [{ code: reason }],
    bytes: 0,
    requestCount: 0,
  });
}

async function noteIdle(
  input: BankRun,
  page: Exclude<PageResult, { kind: 'ok' }>,
  startedAt: string,
): Promise<void> {
  if (page.kind === 'excluded') return;
  if (page.kind === 'manual') {
    await writeJob(input, {
      startedAt,
      status: 'held',
      rowCount: 0,
      errors: [{ code: page.reason }],
      bytes: 0,
      requestCount: 1,
    });
    return;
  }
  input.log(holdLine(input.request.sourceId, page.kind));
  await writeJob(input, {
    startedAt,
    status: 'held',
    rowCount: 0,
    errors: [{ code: page.kind }],
    bytes: 0,
    requestCount: page.kind === 'outside_window' ? 0 : 1,
  });
}
