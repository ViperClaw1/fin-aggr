import { pathToFileURL } from 'node:url';
import { IsoDate, parseCents, Provenance } from '@fa/contracts';
import { databaseUrl, withClient } from '../db';
import type { Sql } from '../decisions';
import { loadLocalEnv } from '../env';
import { revalidateDomain } from '../revalidate';
import { insuranceLimitQuotes } from './limit';
import { commitInsuranceLimits, type ConfirmedLimit } from './publish';

/** The day the eCFR section HTML for 12 CFR 330.1 and 745.1 was saved (ADR-020). */
const RETRIEVED_AT = '2026-11-10T00:00:00.000Z';
const SOURCE_ID = { FDIC: 'ecfr-330', NCUA: 'ecfr-745' } as const;

type Confirmations = ReadonlyMap<string, IsoDate>;

async function readConfirmations(sql: Sql, ids: readonly string[]): Promise<Confirmations> {
  const result = await sql.query(
    `select fact_id, verified_at::text as verified_at from fact_confirmations
     where fact_id = any($1) and status = 'verified' and verified_by = 'human'`,
    [ids],
  );
  return new Map(
    result.rows.map((row) => [String(row['fact_id']), IsoDate.parse(row['verified_at'])]),
  );
}

/**
 * The FDIC and NCUA limits from the saved quotes, each with its own confirmation. Throws, naming
 * the missing fact ids, unless a person confirmed both with `pnpm ingest:confirm`.
 */
export function confirmedLimits(confirmations: Confirmations): ConfirmedLimit[] {
  const quotes = insuranceLimitQuotes();
  const missing = quotes.filter((quote) => !confirmations.has(quote.id)).map((quote) => quote.id);
  if (missing.length > 0) {
    throw new Error(`unconfirmed: run pnpm ingest:confirm ${missing.join(', ')}`);
  }
  return quotes.map((quote) => ({
    regulator: quote.regulator,
    limitPerOwner: parseCents(quote.amountText),
    provenance: Provenance.parse({
      sourceId: SOURCE_ID[quote.regulator],
      sourceUrl: quote.sourceUrl,
      retrievedAt: RETRIEVED_AT,
      verification: { status: 'verified', verifiedAt: confirmations.get(quote.id), by: 'human' },
      isMock: false,
    }),
  }));
}

/** Writes both confirmed limits onto the current reference version; no new version. */
export async function commitConfirmedInsuranceLimits(sql: Sql): Promise<number> {
  const ids = insuranceLimitQuotes().map((quote) => quote.id);
  const limits = confirmedLimits(await readConfirmations(sql, ids));
  const versionId = await commitInsuranceLimits(sql, limits);
  if (versionId === null) throw new Error('no current reference version');
  return versionId;
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  loadLocalEnv();
  withClient(databaseUrl(process.env), (sql) => commitConfirmedInsuranceLimits(sql))
    .then(async (versionId) => {
      process.stdout.write(`insurance limits written on reference version ${String(versionId)}\n`);
      await revalidateDomain(process.env, 'reference');
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'insurance publish failed'}\n`,
      );
      process.exitCode = 1;
    });
}
