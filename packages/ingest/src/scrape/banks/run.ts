import type { Product } from '@fa/contracts';
import { decidePublish } from '../../pipeline';
import { countGate } from '../../validate';
import type { PageRequest, PageResult, ScrapeClient } from '../session';
import { formatManual, type ManualReason } from '../rules';
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
}

function textOf(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}

/**
 * One page through the scrape session.
 * A manual result publishes nothing. The session already recorded that reason.
 * An adapter throw is manual `adapter` and also publishes nothing.
 */
export async function runBankPage(input: {
  client: ScrapeClient;
  request: PageRequest;
  institutionId: string;
  retrievedDay: string;
  read: (text: string) => BankExtract;
  ports: BankPorts;
  log: (line: string) => void;
}): Promise<void> {
  const page = await input.client.get(input.request);
  if (page.kind !== 'ok') {
    logIdle(input.log, input.request.sourceId, page.kind);
    return;
  }
  let extracted: BankExtract;
  try {
    extracted = input.read(textOf(page.body));
  } catch {
    await stopAdapter(input);
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
  const snapshotId = await input.ports.saveSnapshot(page.body);
  const committed = await input.ports.commit({
    institutionId: input.institutionId,
    publish: decision.publish,
    heldIds: suspicious.map((row) => row.key),
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
}

async function stopAdapter(input: {
  request: PageRequest;
  ports: BankPorts;
  log: (line: string) => void;
}): Promise<void> {
  input.log(formatManual(input.request.sourceId, 'adapter'));
  await input.ports.markManual('adapter');
}

function logIdle(
  log: (line: string) => void,
  sourceId: string,
  kind: Exclude<PageResult['kind'], 'ok'>,
): void {
  if (kind === 'manual' || kind === 'excluded' || kind === 'outside_window') return;
  log(`source ${sourceId} held reason=${kind}`);
}
