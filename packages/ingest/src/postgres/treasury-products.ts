import { IsoDate, IsoDateTime } from '@fa/contracts';
import { enqueueReview, withTransaction, type Sql } from '../decisions';
import type { TreasuryOffer } from '../treasury/offers';
import { treasuryProducts, type Confirmation } from '../treasury/product';
import { insertProduct } from './bank-products';
import { integerId } from './id';

const SOURCE_ID = 'treasurydirect';

/**
 * The issuer row. Name, state and site were confirmed by the owner on 2026-11-22: the auction
 * feeds carry none of them. It hangs on the treasury version, like the demo issuers on products.
 */
const ISSUER = {
  id: 'ust',
  name: 'U.S. Department of the Treasury',
  regulator: 'UST',
  kind: 'government',
  hqState: 'DC',
  website: 'https://www.treasurydirect.gov',
  provenance: {
    sourceId: SOURCE_ID,
    sourceUrl: 'https://www.treasurydirect.gov',
    retrievedAt: '2026-11-22T00:00:00.000Z',
    verification: { status: 'verified', verifiedAt: '2026-11-22', by: 'human' },
    isMock: false,
  },
} as const;

async function readConfirmations(sql: Sql): Promise<Map<string, Confirmation>> {
  const result = await sql.query(
    `select fact_id, login, verified_at::text as verified_at
     from fact_confirmations
     where fact_id like 'treasury:%' and status = 'verified' and verified_by = 'human'`,
  );
  return new Map(
    result.rows.map((row) => [
      String(row['fact_id']),
      { login: String(row['login']), verifiedAt: IsoDate.parse(row['verified_at']) },
    ]),
  );
}

async function insertIssuer(sql: Sql, versionId: number): Promise<void> {
  await sql.query(
    `insert into institutions (
       version_id, id, name, regulator, kind, partner_institution_ids, hq_state, website, provenance
     ) values ($1, $2, $3, $4, $5, '{}', $6, $7, $8::jsonb)`,
    [
      versionId,
      ISSUER.id,
      ISSUER.name,
      ISSUER.regulator,
      ISSUER.kind,
      ISSUER.hqState,
      ISSUER.website,
      JSON.stringify(ISSUER.provenance),
    ],
  );
}

async function publishTreasury(
  sql: Sql,
  offers: readonly TreasuryOffer[],
  retrievedAt: IsoDateTime,
): Promise<number> {
  const asOf = IsoDate.parse(retrievedAt.slice(0, 10));
  // throws when a confirmation is missing: the transaction rolls back, the previous version stays
  const products = treasuryProducts(offers, await readConfirmations(sql), retrievedAt, asOf);
  const version = await sql.query(
    `insert into dataset_versions (domain, as_of, is_mock, is_current)
     values ('treasury', $1, false, false) returning id`,
    [asOf],
  );
  const versionId = integerId(version.rows[0]?.['id']);
  await insertIssuer(sql, versionId);
  for (const product of products) await insertProduct(sql, versionId, product);
  await sql.query(`select publish_domain('treasury', $1)`, [versionId]);
  await sql.query(`update sources set last_updated_at = now() where id = $1`, [SOURCE_ID]);
  return versionId;
}

/** One transaction: issuer, eight products, `publish_domain`. A queue row only when held. */
export async function commitTreasuryProducts(
  sql: Sql,
  input: {
    publish: readonly TreasuryOffer[] | null;
    queue: { sourceId: string; domain: string; snapshotId: number; reason: string } | null;
  },
  retrievedAt: string,
): Promise<{ queueId: number | null; versionId: number | null; issueUrl: string | null }> {
  const at = IsoDateTime.parse(retrievedAt);
  return withTransaction(sql, async (tx) => {
    const versionId =
      input.publish === null || input.publish.length === 0
        ? null
        : await publishTreasury(tx, input.publish, at);
    const queued = input.queue === null ? null : await enqueueReview(tx, input.queue);
    return { queueId: queued?.queueId ?? null, versionId, issueUrl: queued?.issueUrl ?? null };
  });
}
