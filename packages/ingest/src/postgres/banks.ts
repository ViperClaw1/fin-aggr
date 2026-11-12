import type { Sql } from '../decisions';
import type { BankRegistryEntry } from '../scrape/registry';

const LICENSE = 'issuer terms';

/**
 * Writes the registry into `sources`. An excluded or manual row is left alone.
 * Leaving the cohort does not delete the row: the opt-out history stays.
 */
export async function upsertBankSources(
  sql: Sql,
  entries: readonly BankRegistryEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  await sql.query(
    `insert into sources (id, name, url, kind, license, operational_kind, schedule)
     select u.id, u.name, u.url, 'issuer_document', $4, 'scrape', '0 8 * * *'
     from unnest($1::text[], $2::text[], $3::text[]) as u(id, name, url)
     on conflict (id) do update
       set name = excluded.name, url = excluded.url
       where sources.excluded = false and sources.status = 'active'`,
    [
      entries.map((entry) => entry.sourceId),
      entries.map((entry) => entry.name),
      entries.map((entry) => entry.url),
      LICENSE,
    ],
  );
}
