import { pathToFileURL } from 'node:url';
import { Provenance } from '@fa/contracts';
import { databaseUrl, withClient } from '../db';
import { withTransaction, type Sql } from '../decisions';
import { loadLocalEnv } from '../env';
import { integerId } from '../postgres/id';
import { revalidateDomain } from '../revalidate';
import { stateFactId, stateRate, stateRates2026 } from './state-rates';

const TAX_YEAR = 2026;
/** The day the state quotes in state-rates.ts were taken (P1.4). */
const RETRIEVED_AT = '2026-11-23T00:00:00.000Z';

const sourceId = (state: string): string => `state-revenue-${state.toLowerCase()}`;

async function confirmations(sql: Sql): Promise<Map<string, string>> {
  const result = await sql.query(
    `select fact_id, verified_at::text as verified_at from fact_confirmations
     where fact_id like 'tax:state-2026:%' and status = 'verified' and verified_by = 'human'`,
  );
  return new Map(result.rows.map((row) => [String(row['fact_id']), String(row['verified_at'])]));
}

/**
 * Writes the confirmed 2026 state rates, each with its own source (ADR-025), on the current
 * reference version. Unconfirmed states keep their rate and fall back to `states_provenance`.
 * Returns the written state codes.
 */
export async function commitStateRates2026(sql: Sql): Promise<string[]> {
  const confirmed = await confirmations(sql);
  const drafts = stateRates2026().filter((draft) => confirmed.has(stateFactId(draft.state)));
  if (drafts.length === 0) throw new Error('no confirmed state rates: run ingest:confirm first');
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
    for (const draft of drafts) {
      const provenance = Provenance.parse({
        sourceId: sourceId(draft.state),
        sourceUrl: draft.sourceUrl,
        retrievedAt: RETRIEVED_AT,
        verification: {
          status: 'verified',
          verifiedAt: confirmed.get(stateFactId(draft.state)),
          by: 'human',
        },
        isMock: false,
      });
      await tx.query(
        `insert into sources (id, name, url, kind, license)
         values ($1, $2, $3, 'official_document', 'public domain')
         on conflict (id) do nothing`,
        [
          sourceId(draft.state),
          `${draft.state} state revenue department`,
          new URL(draft.sourceUrl).origin,
        ],
      );
      const updated = await tx.query(
        `update state_tax_rates set assumed_marginal_rate = $4, provenance = $5::jsonb
         where version_id = $1 and tax_year = $2 and state_code = $3
         returning state_code`,
        [versionId, TAX_YEAR, draft.state, stateRate(draft), JSON.stringify(provenance)],
      );
      if (updated.rows[0] === undefined) throw new Error(`no 2026 rate row for ${draft.state}`);
    }
    return drafts.map((draft) => draft.state);
  });
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  loadLocalEnv();
  withClient(databaseUrl(process.env), (sql) => commitStateRates2026(sql))
    .then(async (states) => {
      process.stdout.write(`tax 2026 state rates written: ${states.join(' ')}\n`);
      await revalidateDomain(process.env, 'reference');
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'state tax publish failed'}\n`,
      );
      process.exitCode = 1;
    });
}
