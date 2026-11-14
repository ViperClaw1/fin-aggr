import { enqueueReview, withTransaction, type Sql } from '../decisions';
import { publishTreasuryProducts } from '../treasury/product-gaps';

export async function ensureAuctionSources(sql: Sql): Promise<void> {
  await sql.query(
    `insert into sources (id, name, url, kind, license, operational_kind, schedule)
     values ($1, $2, $3, 'official_api', 'public domain', 'official_api', '0 7 * * *')
     on conflict (id) do nothing`,
    [
      'treasury-fiscal-data',
      'Treasury Fiscal Data auctions',
      'https://fiscaldata.treasury.gov/datasets/treasury-securities-auctions-data/treasury-securities-auctions-data',
    ],
  );
  await sql.query(
    `insert into sources (id, name, url, kind, license, operational_kind, schedule)
     values ($1, $2, $3, 'official_api', 'public domain', 'official_api', '0 7 * * *')
     on conflict (id) do nothing`,
    [
      'treasurydirect',
      'TreasuryDirect auctioned securities',
      'https://www.treasurydirect.gov/TA_WS/securities/auctioned',
    ],
  );
}

/** A review row only. A product publish is refused until the quotes are confirmed. */
export async function commitAuctionHold(
  sql: Sql,
  input: {
    publish: readonly unknown[] | null;
    queue: { sourceId: string; domain: string; snapshotId: number; reason: string } | null;
  },
): Promise<{ queueId: number | null; versionId: number | null; issueUrl: string | null }> {
  if (input.publish !== null) publishTreasuryProducts();
  const queue = input.queue;
  if (queue === null) return { queueId: null, versionId: null, issueUrl: null };
  return withTransaction(sql, async (tx) => {
    const queued = await enqueueReview(tx, queue);
    return { queueId: queued.queueId, versionId: null, issueUrl: queued.issueUrl };
  });
}
