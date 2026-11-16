// Issuers of the products on this page, plus the partner banks the safety badge names.
// Resolved by id: the institutions directory is the FDIC registry, and its first page
// does not contain the fixture banks the demo products point at.
import type { Id, Institution } from '@fa/contracts';

export type Issuer = Pick<Institution, 'id' | 'name' | 'kind' | 'partnerInstitutionIds'>;

function kept(row: Issuer): Issuer {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    partnerInstitutionIds: row.partnerInstitutionIds,
  };
}

export async function issuersFor(
  institutionIds: readonly Id[],
  load: (id: Id) => Promise<Issuer | null>,
): Promise<Issuer[]> {
  const ids = [...new Set(institutionIds)];
  const loaded = await Promise.all(ids.map((id) => load(id)));
  const rows = loaded.flatMap((row) => (row === null ? [] : [kept(row)]));
  const have = new Set(rows.map((row) => row.id));
  const partnerIds = [...new Set(rows.flatMap((row) => row.partnerInstitutionIds))].filter(
    (id) => !have.has(id),
  );
  const partners = await Promise.all(partnerIds.map((id) => load(id)));
  for (const partner of partners) {
    if (partner !== null) rows.push(kept(partner));
  }
  return rows;
}
