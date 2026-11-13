import type { Sql } from '../decisions';

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
