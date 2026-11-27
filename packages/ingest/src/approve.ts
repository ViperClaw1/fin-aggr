import type { Product } from '@fa/contracts';
import { databaseUrl, withClient } from './db';
import { approveReview, openReview, withTransaction, type OpenReview, type Sql } from './decisions';
import {
  bankConfirmation,
  confirmReviewedProducts,
  publishApprovedBankRows,
  reviewedProductIds,
} from './postgres/bank-products';
import {
  activateProposal,
  activeConfigs,
  proposalIdOf,
  sampleTemplateOf,
} from './postgres/adapter-configs';
import { downloadRawSnapshot } from './postgres/ports';
import { revalidateDomain } from './revalidate';
import { approvedBankRows } from './scrape/banks/approved';

type Publisher = (sql: Sql, row: OpenReview) => Promise<void>;

const publishers = new Map<string, Publisher>();

/** Step 6 registers the parser that turns a held snapshot into a version. */
export function registerPublisher(sourceId: string, publish: Publisher): void {
  publishers.set(sourceId, publish);
}

/** Ports of the approve path. Tests replace them; the CLI uses the real database, bucket, and site. */
export interface CliDeps {
  withSql<T>(run: (sql: Sql) => Promise<T>): Promise<T>;
  snapshot(bucketPath: string): Promise<Uint8Array>;
  revalidate(domain: string): Promise<void>;
}

export function defaultDeps(env: NodeJS.ProcessEnv): CliDeps {
  return {
    withSql: (run) => withClient(databaseUrl(env), run),
    snapshot: (bucketPath) => downloadRawSnapshot(env, bucketPath),
    revalidate: (domain) => revalidateDomain(env, domain),
  };
}

export interface CliIo {
  log: (line: string) => void;
  warn: (line: string) => void;
  ghLogin: () => Promise<string>;
  now: () => string;
}

/** Everything approve and publish-approved need, checked before the database is touched. */
export const PUBLISH_ENV = [
  'SUPABASE_DB_URL',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'REVALIDATE_SECRET',
] as const;

export function assertPublishEnv(env: NodeJS.ProcessEnv): void {
  const missing = PUBLISH_ENV.filter((name) => (env[name]?.trim() ?? '') === '');
  if (missing.length > 0) throw new Error(`missing env: ${missing.join(' ')}`);
}

export function revalidateWarning(domain: string): string {
  return `revalidate ${domain} failed; the version is committed. Run: pnpm ingest:revalidate ${domain}`;
}

export async function revalidateOrWarn(
  deps: CliDeps,
  domain: string,
  warn: (line: string) => void,
): Promise<void> {
  try {
    await deps.revalidate(domain);
  } catch {
    warn(revalidateWarning(domain));
  }
}

export function publishedLine(id: number, versionId: number | null): string {
  return versionId === null
    ? `review ${String(id)} already published`
    : `review ${String(id)} published version=${String(versionId)}`;
}

export async function rowWithStatus(
  sql: Sql,
  id: number,
  status: 'open' | 'approved',
): Promise<OpenReview> {
  const result = await sql.query(
    `select id, source_id, domain, reason, snapshot_id, issue_url
     from review_queue where id = $1 and status = $2`,
    [id, status],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error(`review ${String(id)} is not ${status}`);
  return openReview(row);
}

interface BankPublish {
  institutionId: string;
  rows: Product[];
  snapshotIds: string[];
}

async function snapshotOf(sql: Sql, snapshotId: number): Promise<{ path: string; day: string }> {
  const found = await sql.query(
    `select bucket_path, created_at::date::text as day from raw_snapshots where id = $1`,
    [snapshotId],
  );
  const path = found.rows[0]?.['bucket_path'];
  const day = found.rows[0]?.['day'];
  if (typeof path !== 'string' || typeof day !== 'string') throw new Error('snapshot is missing');
  return { path, day };
}

/**
 * Reads the row's snapshot and the products it lists, before any transaction.
 * An unconfirmed bank publishes nothing: its products are confirmed only.
 */
async function bankPublishFor(
  sql: Sql,
  deps: CliDeps,
  row: OpenReview,
  warn: (line: string) => void,
): Promise<BankPublish | null> {
  if (row.snapshot_id === null) throw new Error(`review ${String(row.id)} has no snapshot`);
  const confirmation = await bankConfirmation(sql, row.source_id);
  if (!confirmation.confirmed) {
    warn(`${row.source_id} is not confirmed; products are confirmed, not published`);
    return null;
  }
  const snapshot = await snapshotOf(sql, row.snapshot_id);
  const approved = approvedBankRows({
    sourceId: row.source_id,
    reason: row.reason,
    snapshot: await deps.snapshot(snapshot.path),
    retrievedDay: snapshot.day,
    bankVerifiedAt: confirmation.verifiedAt,
    activeConfigs: await activeConfigs(sql, warn),
  });
  if (approved.rows.length !== reviewedProductIds(row.source_id, row.reason).length) {
    throw new Error(`snapshot of review ${String(row.id)} does not hold every listed product`);
  }
  return approved;
}

/** Finishes an approved bank row whose publish did not run. A second call publishes nothing. */
export async function publishApproved(id: number, io: CliIo, deps: CliDeps): Promise<void> {
  const versionId = await deps.withSql(async (sql) => {
    const row = await rowWithStatus(sql, id, 'approved');
    if (!row.source_id.startsWith('bank:')) {
      throw new Error(`review ${String(id)} is not a bank review`);
    }
    const plan = await bankPublishFor(sql, deps, row, io.warn);
    if (plan === null) throw new Error(`${row.source_id} is not confirmed`);
    return withTransaction(sql, (tx) =>
      publishApprovedBankRows(tx, { sourceId: row.source_id, ...plan }, plan.snapshotIds),
    );
  });
  io.log(publishedLine(id, versionId));
  if (versionId !== null) await revalidateOrWarn(deps, 'bank_products', io.warn);
}

/** Decision, product confirmations, and publish commit together. Revalidate runs after. */
export async function approveRow(input: {
  sql: Sql;
  row: OpenReview;
  login: string;
  io: CliIo;
  deps: CliDeps;
  minutes?: number | null;
}): Promise<{ planned: boolean; versionId: number | null }> {
  const { sql, row, login, io, deps } = input;
  const minutes = input.minutes ?? null;
  const proposalId = proposalIdOf(row.reason);
  if (proposalId !== null) {
    // An adapter proposal publishes no product: the next bank-rates run reads with it.
    await approveReview(sql, {
      id: row.id,
      login,
      minutes,
      decidedAt: io.now(),
      publish: async (tx) => {
        await activateProposal(tx, { id: proposalId, login, decidedAt: io.now() });
      },
    });
    return { planned: false, versionId: null };
  }
  if (sampleTemplateOf(row.reason) !== null) {
    // A sample a person accepts changes nothing: the products are already published.
    await approveReview(sql, {
      id: row.id,
      login,
      minutes,
      decidedAt: io.now(),
      publish: () => Promise.resolve(),
    });
    return { planned: false, versionId: null };
  }
  const bank = row.source_id.startsWith('bank:');
  const plan = bank ? await bankPublishFor(sql, deps, row, io.warn) : null;
  const publish = bank ? undefined : publishers.get(row.source_id);
  if (!bank && publish === undefined) {
    throw new Error(`No held publisher is registered for ${row.source_id}`);
  }
  const result: { planned: boolean; versionId: number | null } = {
    planned: plan !== null,
    versionId: null,
  };
  await approveReview(sql, {
    id: row.id,
    login,
    minutes,
    decidedAt: io.now(),
    publish: async (tx) => {
      if (publish !== undefined) {
        await publish(tx, row);
        return;
      }
      await confirmReviewedProducts(tx, {
        sourceId: row.source_id,
        reason: row.reason,
        snapshotId: row.snapshot_id,
        login,
        verifiedAt: io.now().slice(0, 10),
      });
      if (plan !== null) {
        result.versionId = await publishApprovedBankRows(
          tx,
          { sourceId: row.source_id, ...plan },
          plan.snapshotIds,
        );
      }
    },
  });
  return result;
}
