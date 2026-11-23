import { pathToFileURL } from 'node:url';
import { IsoDate, Provenance } from '@fa/contracts';
import { databaseUrl, withClient } from '../db';
import { withTransaction, type Sql } from '../decisions';
import { loadLocalEnv } from '../env';
import { integerId } from '../postgres/id';
import { revalidateDomain } from '../revalidate';
import type { Confirmation } from '../treasury/product';
import { FEDERAL_2026_FACT_ID, publishFederalBrackets } from './publish';

const SOURCE_ID = 'irs-rev-proc';
const TAX_YEAR = 2026;
/** The day the Rev. Proc. 2025-32 excerpt was saved (ADR-020, federal income brackets draft). */
const RETRIEVED_AT = '2026-11-10T00:00:00.000Z';

async function readConfirmation(sql: Sql): Promise<Confirmation | undefined> {
  const result = await sql.query(
    `select login, verified_at::text as verified_at from fact_confirmations
     where fact_id = $1 and status = 'verified' and verified_by = 'human'`,
    [FEDERAL_2026_FACT_ID],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  return { login: String(row['login']), verifiedAt: IsoDate.parse(row['verified_at']) };
}

/**
 * Replaces the 2026 federal brackets on the current reference version (ADR-024). The state rates
 * stay, and keep their old source in `states_provenance`. No new version: like the insurance
 * limit, this corrects reference data in place. Throws before any write without the second check.
 */
export async function commitFederalBrackets2026(sql: Sql): Promise<number> {
  const tables = publishFederalBrackets(await readConfirmation(sql));
  const provenance = Provenance.parse({
    sourceId: SOURCE_ID,
    sourceUrl: tables.sourceUrl,
    retrievedAt: RETRIEVED_AT,
    verification: tables.verification,
    isMock: false,
  });
  return withTransaction(sql, async (tx) => {
    const current = await tx.query(
      `select t.version_id from tax_tables t
       join dataset_versions v on v.id = t.version_id
       where v.domain = 'reference' and v.is_current and t.tax_year = $1`,
      [TAX_YEAR],
    );
    const id = current.rows[0]?.['version_id'];
    if (id === undefined) throw new Error('no current reference tax table for 2026');
    const versionId = integerId(id);
    await tx.query(
      `insert into sources (id, name, url, kind, license)
       values ($1, 'IRS Revenue Procedures', 'https://www.irs.gov/irb', 'official_document',
               'public domain')
       on conflict (id) do nothing`,
      [SOURCE_ID],
    );
    await tx.query(
      `update tax_tables
       set states_provenance = coalesce(states_provenance, provenance), provenance = $3::jsonb
       where version_id = $1 and tax_year = $2`,
      [versionId, TAX_YEAR, JSON.stringify(provenance)],
    );
    await tx.query(`delete from tax_brackets where version_id = $1 and tax_year = $2`, [
      versionId,
      TAX_YEAR,
    ]);
    for (const table of tables.tables) {
      for (const [ord, bracket] of table.brackets.entries()) {
        await tx.query(
          `insert into tax_brackets (version_id, tax_year, filing_status, ord, up_to, rate)
           values ($1, $2, $3, $4, $5, $6)`,
          [versionId, TAX_YEAR, table.filingStatus, ord, bracket.upTo, bracket.rate],
        );
      }
    }
    return versionId;
  });
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  loadLocalEnv();
  withClient(databaseUrl(process.env), (sql) => commitFederalBrackets2026(sql))
    .then(async (versionId) => {
      process.stdout.write(
        `tax 2026 federal brackets written on reference version ${String(versionId)}\n`,
      );
      await revalidateDomain(process.env, 'reference');
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : 'tax publish failed'}\n`);
      process.exitCode = 1;
    });
}
