import type { Sql } from '../decisions';
import { asHtmlTableConfig, type HtmlTableConfig } from '../scrape/banks/config';
import { templateOf } from '../scrape/onboard/policy';
import type { Proposal } from '../scrape/onboard/propose';
import { integerId } from './id';

/** Review-queue reason of a model proposal (plan 8.6). The id is the `adapter_configs` row. */
const PROPOSAL = /^adapter_proposal:(\d+)\b/;

export function proposalReason(id: number, failures: readonly string[]): string {
  return [`adapter_proposal:${String(id)}`, ...failures].join(' ');
}

export function proposalIdOf(reason: string): number | null {
  const match = PROPOSAL.exec(reason);
  return match?.[1] === undefined ? null : integerId(match[1]);
}

/** Who approves on behalf of the ADR-026 checks; never a GitHub login. */
export const AUTOMATED = 'automated_check';

/** Template of an institution from its latest survey row (ADR-026 platform fingerprint). */
export async function institutionTemplate(sql: Sql, institutionId: string): Promise<string> {
  const found = await sql.query(
    `select generator from survey_results where institution_id = $1
     order by surveyed_at desc limit 1`,
    [institutionId],
  );
  const generator = found.rows[0]?.['generator'];
  return templateOf('html_table', typeof generator === 'string' ? generator : null);
}

/** Institutions of this template whose config a person approved, and whether it is stopped. */
export async function templateState(
  sql: Sql,
  template: string,
): Promise<{ humanApproved: number; stopped: boolean }> {
  const found = await sql.query(
    `select
       (select count(distinct institution_id)::int from adapter_configs
        where template = $1 and status in ('active', 'retired') and decided_by <> $2) as approved,
       exists (select 1 from template_stops where template = $1 and cleared_at is null) as stopped`,
    [template, AUTOMATED],
  );
  const row = found.rows[0] ?? {};
  return { humanApproved: Number(row['approved'] ?? 0), stopped: row['stopped'] === true };
}

/**
 * ADR-026: every check passed and the template may publish automatically. The bank and the
 * products the config read are confirmed with `verified_by = automated_check`, no login.
 */
export async function confirmAutomatically(
  sql: Sql,
  input: {
    sourceId: string;
    productIds: readonly string[];
    verifiedAt: string;
    snapshotId: number;
  },
): Promise<void> {
  await sql.query(
    `insert into bank_confirmations (source_id, status, verified_by, login, verified_at)
     values ($1, 'verified', 'automated_check', null, $2)
     on conflict (source_id) do nothing`,
    [input.sourceId, input.verifiedAt],
  );
  for (const id of input.productIds) {
    await sql.query(
      `insert into bank_product_confirmations (source_id, product_id, login, verified_at, snapshot_id)
       values ($1, $2, null, $3, $4)
       on conflict (source_id, product_id) do nothing`,
      [input.sourceId, id, input.verifiedAt, input.snapshotId],
    );
  }
}

/** Review reason of a weekly sample row (ADR-026): `sample_check:<template>`. */
const SAMPLE = /^sample_check:(\S+)/;

export function sampleReason(template: string): string {
  return `sample_check:${template}`;
}

export function sampleTemplateOf(reason: string): string | null {
  return SAMPLE.exec(reason)?.[1] ?? null;
}

/** Banks confirmed by the checks, with their template and newest snapshot. */
export async function automatedBanks(
  sql: Sql,
): Promise<{ sourceId: string; template: string; snapshotId: number }[]> {
  const found = await sql.query(
    `select c.source_id, a.template,
            (select max(r.id) from raw_snapshots r where r.source_id = c.source_id) as snapshot_id
     from bank_confirmations c
     join adapter_configs a
       on 'bank:' || a.institution_id = c.source_id and a.status = 'active'
     where c.verified_by = $1
     order by c.source_id`,
    [AUTOMATED],
  );
  return found.rows.flatMap((row) =>
    row['snapshot_id'] === null || typeof row['template'] !== 'string'
      ? []
      : [
          {
            sourceId: String(row['source_id']),
            template: row['template'],
            snapshotId: integerId(row['snapshot_id']),
          },
        ],
  );
}

/** A rejected sample stops automated publishing for its template (ADR-026). */
export async function stopTemplate(sql: Sql, template: string, reviewId: number): Promise<void> {
  await sql.query(
    `insert into template_stops (template, review_id) values ($1, $2)
     on conflict (template) do update set review_id = $2, stopped_at = now(), cleared_at = null`,
    [template, reviewId],
  );
}

export async function insertProposal(
  sql: Sql,
  input: { institutionId: string; snapshotId: number; proposal: Proposal; template: string },
): Promise<number> {
  const { proposal } = input;
  const result = await sql.query(
    `insert into adapter_configs (institution_id, kind, config, snapshot_id, model,
       prompt_version, input_tokens, output_tokens, failures, template)
     values ($1, 'html_table', $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [
      input.institutionId,
      JSON.stringify(proposal.config ?? {}),
      input.snapshotId,
      proposal.model,
      proposal.promptVersion,
      proposal.usage.inputTokens,
      proposal.usage.outputTokens,
      proposal.failures,
      input.template,
    ],
  );
  return integerId(result.rows[0]?.['id']);
}

/**
 * In the approve transaction: the proposal becomes the bank's only active config.
 * A proposal without a config (the model said the page is not supported) cannot be approved.
 */
export async function activateProposal(
  tx: Sql,
  input: { id: number; login: string; decidedAt: string },
): Promise<string> {
  const found = await tx.query(
    `select institution_id, config from adapter_configs where id = $1 and status = 'proposed'`,
    [input.id],
  );
  const row = found.rows[0];
  if (row === undefined) throw new Error(`adapter proposal ${String(input.id)} is not open`);
  const config = asHtmlTableConfig(row['config']);
  await tx.query(
    `update adapter_configs set status = 'retired', decided_at = $2, decided_by = $3
     where institution_id = $1 and status = 'active'`,
    [config.institutionId, input.decidedAt, input.login],
  );
  await tx.query(
    `update adapter_configs set status = 'active', decided_at = $2, decided_by = $3 where id = $1`,
    [input.id, input.decidedAt, input.login],
  );
  return config.institutionId;
}

/** Active configs. A row that fails the shape check is skipped and named, never guessed at. */
export async function activeConfigs(
  sql: Sql,
  log: (line: string) => void,
): Promise<HtmlTableConfig[]> {
  const result = await sql.query(
    `select id, config from adapter_configs where status = 'active' order by institution_id`,
  );
  return result.rows.flatMap((row) => {
    try {
      return [asHtmlTableConfig(row['config'])];
    } catch {
      log(`adapter_config ${String(row['id'])} invalid; skipped`);
      return [];
    }
  });
}
