import type { Provenance } from '@fa/contracts';
import { withTransaction, type Sql } from '../decisions';
import { integerId } from '../postgres/id';
import { insuranceLimitQuotes } from './limit';

export interface ConfirmedLimit {
  regulator: 'FDIC' | 'NCUA';
  /** Cents already converted from the confirmed dollar figure. */
  limitPerOwner: number;
  provenance: Provenance;
}

/**
 * The saved quotes stay `unverified`. This refuses to write them.
 * A later call can pass rows only after a person has checked the HTML.
 */
function requireHumanConfirmation(limits: readonly ConfirmedLimit[]): void {
  if (
    limits.length !== 2 ||
    limits.some(
      (limit) =>
        limit.provenance.verification.status !== 'verified' ||
        limit.provenance.verification.by !== 'human' ||
        limit.provenance.isMock,
    )
  ) {
    throw new Error('insurance limit stays unverified until the saved HTML is confirmed');
  }
}

/** Writes the limit onto the current reference version. Does not touch par yields. */
export async function commitInsuranceLimits(
  sql: Sql,
  limits: readonly ConfirmedLimit[],
): Promise<number | null> {
  requireHumanConfirmation(limits);
  return withTransaction(sql, async (tx) => {
    const current = await tx.query(
      `select id from dataset_versions where domain = 'reference' and is_current`,
    );
    const id = current.rows[0]?.['id'];
    if (id === undefined) return null;
    const versionId = integerId(id);
    const provenance = limits[0]?.provenance;
    if (provenance === undefined) return null;
    await tx.query(
      `update insurance_rules
       set provenance = $2::jsonb
       where version_id = $1`,
      [versionId, JSON.stringify(provenance)],
    );
    for (const limit of limits) {
      await tx.query(
        `insert into insurance_limits (version_id, regulator, limit_per_owner)
         values ($1, $2, $3)
         on conflict (version_id, regulator)
         do update set limit_per_owner = excluded.limit_per_owner`,
        [versionId, limit.regulator, String(limit.limitPerOwner)],
      );
    }
    return versionId;
  });
}

/** Production quotes are unverified, so this does not publish. */
export function publishSavedInsuranceQuotes(): never {
  insuranceLimitQuotes();
  throw new Error('insurance limit stays unverified until the saved HTML is confirmed');
}
