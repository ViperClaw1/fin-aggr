import type { Sql } from '../decisions';
import { asHtmlTableConfig, type HtmlTableConfig } from '../scrape/banks/config';
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

export async function insertProposal(
  sql: Sql,
  input: { institutionId: string; snapshotId: number; proposal: Proposal },
): Promise<number> {
  const { proposal } = input;
  const result = await sql.query(
    `insert into adapter_configs (institution_id, kind, config, snapshot_id, model,
       prompt_version, input_tokens, output_tokens, failures)
     values ($1, 'html_table', $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      input.institutionId,
      JSON.stringify(proposal.config ?? {}),
      input.snapshotId,
      proposal.model,
      proposal.promptVersion,
      proposal.usage.inputTokens,
      proposal.usage.outputTokens,
      proposal.failures,
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
