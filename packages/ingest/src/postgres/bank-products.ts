import { centsFromInteger, Product, type Product as ProductRow } from '@fa/contracts';
import { enqueueReview, supersedeOpenReviews, withTransaction, type Sql } from '../decisions';
import { integerId } from './id';
import { previousUnlessMock } from './previous';

const DOMAIN = 'bank_products';

function textField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value === '') throw new Error(`bank product is missing ${key}`);
  return value;
}

function centsField(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`bank product is missing ${key}`);
  return centsFromInteger(value);
}

function productFromDb(row: Record<string, unknown>): ProductRow {
  const tiers = row['tiers'];
  if (!Array.isArray(tiers)) throw new Error('bank product is missing tiers');
  const parsed = Product.safeParse({
    id: row['id'],
    institutionId: row['institution_id'],
    category: row['category'],
    name: row['name'],
    termMonths: row['term_months'],
    tierMode: row['tier_mode'],
    tiers: tiers.map((tier) => {
      if (typeof tier !== 'object' || tier === null) throw new Error('bank product tier');
      const item = tier as Record<string, unknown>;
      return {
        minBalance: centsField(item, 'minBalance'),
        maxBalance: centsField(item, 'maxBalance'),
        apy: item['apy'],
      };
    }),
    compounding: row['compounding'],
    minOpening: centsField(row, 'min_opening'),
    maxDeposit: centsField(row, 'max_deposit'),
    earlyWithdrawal: row['early_withdrawal'],
    eligibility: row['eligibility'],
    taxTreatment: row['tax_treatment'],
    validFrom: textField(row, 'valid_from'),
    validTo: row['valid_to'],
    provenance: row['provenance'],
  });
  if (!parsed.success) throw new Error('stored bank product is invalid');
  return parsed.data;
}

const PRODUCT_COLUMNS = `id, institution_id, category, name, term_months, tier_mode, compounding,
  min_opening::text as min_opening, max_deposit::text as max_deposit,
  early_withdrawal, eligibility, tax_treatment, valid_from::text as valid_from,
  valid_to::text as valid_to, provenance`;

async function readBankProducts(sql: Sql, institutionId: string): Promise<ProductRow[]> {
  const result = await sql.query(
    `select ${PRODUCT_COLUMNS},
       coalesce((
         select json_agg(json_build_object(
           'minBalance', t.min_balance::text,
           'maxBalance', t.max_balance::text,
           'apy', t.apy::text
         ) order by t.ord)
         from product_tiers t
         where t.version_id = p.version_id and t.product_id = p.id
       ), '[]'::json) as tiers
     from products p
     where p.version_id = (
       select id from dataset_versions where domain = '${DOMAIN}' and is_current
     )
       and p.institution_id = $1`,
    [institutionId],
  );
  return result.rows.map(productFromDb);
}

/** The mock version is not a baseline for a move or a count check. */
export function previousBankProducts(sql: Sql, institutionId: string): Promise<ProductRow[]> {
  return previousUnlessMock(sql, DOMAIN, (tx) => readBankProducts(tx, institutionId));
}

export async function bankConfirmation(
  sql: Sql,
  sourceId: string,
): Promise<{ confirmed: false } | { confirmed: true; verifiedAt: string }> {
  const result = await sql.query(
    `select verified_at::text as verified_at from bank_confirmations where source_id = $1`,
    [sourceId],
  );
  const verifiedAt = result.rows[0]?.['verified_at'];
  if (typeof verifiedAt !== 'string') return { confirmed: false };
  return { confirmed: true, verifiedAt };
}

/**
 * Records that a person accepted this bank's eligibility. Does not publish.
 * A bank that is already confirmed keeps its row; the caller prints that state.
 */
export async function confirmBank(
  sql: Sql,
  input: { sourceId: string; login: string; verifiedAt: string },
): Promise<{ created: boolean; login: string; verifiedAt: string }> {
  const inserted = await sql.query(
    `insert into bank_confirmations (source_id, status, verified_by, login, verified_at)
     values ($1, 'verified', 'human', $2, $3)
     on conflict (source_id) do nothing
     returning source_id`,
    [input.sourceId, input.login, input.verifiedAt],
  );
  if (inserted.rows[0] !== undefined)
    return { created: true, login: input.login, verifiedAt: input.verifiedAt };
  const found = await sql.query(
    `select login, verified_at::text as verified_at from bank_confirmations where source_id = $1`,
    [input.sourceId],
  );
  const row = found.rows[0] ?? {};
  return { created: false, login: String(row['login']), verifiedAt: String(row['verified_at']) };
}

/** Product ids a person confirmed for this bank. */
export async function confirmedProductIds(sql: Sql, sourceId: string): Promise<string[]> {
  const result = await sql.query(
    `select product_id from bank_product_confirmations where source_id = $1 order by product_id`,
    [sourceId],
  );
  return result.rows.map((row) => String(row['product_id']));
}

/**
 * Product ids named in a bank review reason (`<id>: <reasons>; ...`).
 * Only ids of this bank count, so a count-gate text is never read as a product.
 */
export function reviewedProductIds(sourceId: string, reason: string): string[] {
  const prefix = `${sourceId.replace(/^bank:/, '').replaceAll(':', '-')}-`;
  const ids = reason
    .split('; ')
    .map((part) => part.split(': ')[0] ?? '')
    .filter((id) => id.startsWith(prefix) && id.length > prefix.length);
  return [...new Set(ids)];
}

/** `ingest:approve` on a bank row confirms exactly the products listed in it. The next run publishes. */
export async function confirmReviewedProducts(
  sql: Sql,
  input: {
    sourceId: string;
    reason: string;
    snapshotId: number | null;
    login: string;
    verifiedAt: string;
  },
): Promise<string[]> {
  const ids = reviewedProductIds(input.sourceId, input.reason);
  if (ids.length === 0) throw new Error(`review for ${input.sourceId} lists no product`);
  for (const id of ids) {
    await sql.query(
      `insert into bank_product_confirmations (source_id, product_id, login, verified_at, snapshot_id)
       values ($1, $2, $3, $4, $5)
       on conflict (source_id, product_id) do nothing`,
      [input.sourceId, id, input.login, input.verifiedAt, input.snapshotId],
    );
  }
  return ids;
}

async function insertVersion(sql: Sql, asOf: string): Promise<number> {
  const result = await sql.query(
    `insert into dataset_versions (domain, as_of, is_mock, is_current)
     values ('${DOMAIN}', $1, false, false) returning id`,
    [asOf],
  );
  return integerId(result.rows[0]?.['id']);
}

async function copyKept(
  sql: Sql,
  versionId: number,
  institutionId: string,
  heldIds: readonly string[],
): Promise<void> {
  const params = [versionId, institutionId, heldIds];
  await sql.query(
    `insert into products (
       version_id, id, institution_id, category, name, term_months, tier_mode, compounding,
       min_opening, max_deposit, early_withdrawal, eligibility, tax_treatment,
       valid_from, valid_to, provenance
     )
     select $1, p.id, p.institution_id, p.category, p.name, p.term_months, p.tier_mode,
            p.compounding, p.min_opening, p.max_deposit, p.early_withdrawal, p.eligibility,
            p.tax_treatment, p.valid_from, p.valid_to, p.provenance
     from products p
     join dataset_versions v on v.id = p.version_id
     where v.domain = '${DOMAIN}' and v.is_current and v.is_mock = false
       and (p.institution_id <> $2 or p.id = any($3::text[]))`,
    params,
  );
  await sql.query(
    `insert into product_tiers (version_id, product_id, ord, min_balance, max_balance, apy)
     select $1, t.product_id, t.ord, t.min_balance, t.max_balance, t.apy
     from product_tiers t
     join products p on p.version_id = t.version_id and p.id = t.product_id
     join dataset_versions v on v.id = p.version_id
     where v.domain = '${DOMAIN}' and v.is_current and v.is_mock = false
       and (p.institution_id <> $2 or p.id = any($3::text[]))`,
    params,
  );
}

async function insertProduct(sql: Sql, versionId: number, product: ProductRow): Promise<void> {
  await sql.query(
    `insert into products (
       version_id, id, institution_id, category, name, term_months, tier_mode, compounding,
       min_opening, max_deposit, early_withdrawal, eligibility, tax_treatment,
       valid_from, valid_to, provenance
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16::jsonb
     )`,
    [
      versionId,
      product.id,
      product.institutionId,
      product.category,
      product.name,
      product.termMonths,
      product.tierMode,
      product.compounding,
      product.minOpening,
      product.maxDeposit,
      JSON.stringify(product.earlyWithdrawal),
      JSON.stringify(product.eligibility),
      product.taxTreatment,
      product.validFrom,
      product.validTo,
      JSON.stringify(product.provenance),
    ],
  );
  for (const [ord, tier] of product.tiers.entries()) {
    await sql.query(
      `insert into product_tiers (version_id, product_id, ord, min_balance, max_balance, apy)
       values ($1, $2, $3, $4, $5, $6::rate)`,
      [versionId, product.id, ord, tier.minBalance, tier.maxBalance, tier.apy],
    );
  }
}

async function publishRows(
  sql: Sql,
  institutionId: string,
  rows: readonly ProductRow[],
  heldIds: readonly string[],
): Promise<number> {
  const asOf = rows
    .map((row) => row.validFrom)
    .sort()
    .at(-1);
  if (asOf === undefined) throw new Error('bank publish is empty');
  const versionId = await insertVersion(sql, asOf);
  await copyKept(sql, versionId, institutionId, heldIds);
  for (const row of rows) await insertProduct(sql, versionId, row);
  await sql.query(
    `update dataset_versions
       set as_of = (select max(valid_from) from products where version_id = $1)
     where id = $1`,
    [versionId],
  );
  await sql.query(`select publish_domain('${DOMAIN}', $1)`, [versionId]);
  return versionId;
}

/**
 * Publishes approved rows of one bank inside the caller's transaction.
 * A row whose id is already in the current version is skipped, so a second
 * call is a no-op (null). This bank's other current rows are kept.
 */
export async function publishApprovedBankRows(
  tx: Sql,
  input: { sourceId: string; institutionId: string; rows: readonly ProductRow[] },
): Promise<number | null> {
  const current = await previousBankProducts(tx, input.institutionId);
  const currentIds = new Set(current.map((row) => row.id));
  const rows = input.rows.filter((row) => !currentIds.has(row.id));
  if (rows.length === 0) return null;
  const replaced = new Set(rows.map((row) => row.id));
  const kept = current.map((row) => row.id).filter((id) => !replaced.has(id));
  const versionId = await publishRows(tx, input.institutionId, rows, kept);
  await supersedeOpenReviews(tx, input.sourceId, versionId);
  await tx.query(`update sources set last_updated_at = now() where id = $1`, [input.sourceId]);
  return versionId;
}

/**
 * Clean rows become the current `bank_products` version.
 * A null publish leaves the previous version current.
 * Other banks are copied. A held id of this bank keeps its previous row.
 */
export async function commitBankProducts(
  sql: Sql,
  input: {
    institutionId: string;
    publish: readonly ProductRow[] | null;
    heldIds: readonly string[];
    queue: { sourceId: string; domain: string; snapshotId: number; reason: string } | null;
  },
): Promise<{ queueId: number | null; versionId: number | null }> {
  return withTransaction(sql, async (tx) => {
    const versionId =
      input.publish === null || input.publish.length === 0
        ? null
        : await publishRows(tx, input.institutionId, input.publish, input.heldIds);
    if (versionId !== null) {
      const sourceId = input.queue?.sourceId ?? `bank:${input.institutionId}`;
      await supersedeOpenReviews(tx, sourceId, versionId);
      await tx.query(`update sources set last_updated_at = now() where id = $1`, [sourceId]);
    }
    if (input.queue === null) return { queueId: null, versionId };
    const queued = await enqueueReview(tx, input.queue);
    return { queueId: queued.queueId, versionId };
  });
}
