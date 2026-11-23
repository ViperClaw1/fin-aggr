import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import { reviewerFrom } from './cli';
import { databaseUrl, withClient } from './db';
import type { Sql } from './decisions';
import { loadLocalEnv } from './env';
import { insuranceLimitQuotes } from './insurance/limit';
import { requireReviewer } from './policy';
import { FEDERAL_2026_FACT_ID } from './tax/publish';
import { federalBrackets2026 } from './tax/federal-brackets';
import { stateFactId, stateRates2026 } from './tax/state-rates';
import { treasuryProductGaps } from './treasury/product-gaps';

const execFileAsync = promisify(execFile);

const FACT_ID = /^[a-z0-9][a-z0-9:_-]{0,63}$/;

export interface ConfirmCommand {
  factId: string;
}

export interface ConfirmableFact {
  id: string;
  citation: string;
  sourceUrl: string;
  quote: string;
}

function confirmableIds(): Set<string> {
  return new Set([
    ...insuranceLimitQuotes().map((quote) => quote.id),
    ...treasuryProductGaps().map((gap) => gap.id),
    FEDERAL_2026_FACT_ID,
    ...stateRates2026().map((draft) => stateFactId(draft.state)),
  ]);
}

/** The text a person has to see before the confirmation row is written. */
export function confirmableFact(factId: string): ConfirmableFact {
  const insurance = insuranceLimitQuotes().find((quote) => quote.id === factId);
  if (insurance !== undefined) {
    return {
      id: insurance.id,
      citation: `12 CFR ${insurance.section}`,
      sourceUrl: insurance.sourceUrl,
      quote: insurance.quote,
    };
  }
  const gap = treasuryProductGaps().find((item) => item.id === factId);
  if (gap !== undefined) {
    return {
      id: gap.id,
      citation: gap.citation,
      sourceUrl: gap.sourceUrl,
      quote: gap.quote,
    };
  }
  if (factId === FEDERAL_2026_FACT_ID) return federalFact();
  const state = stateRates2026().find((draft) => stateFactId(draft.state) === factId);
  if (state !== undefined) {
    const zero = state.zeroUpTo === undefined ? '' : `, 0% up to ${state.zeroUpTo}`;
    return {
      id: factId,
      citation: `${state.state} 2026 rate on interest: ${state.percent}% (${state.kind}${zero})`,
      sourceUrl: state.sourceUrl,
      quote: state.note === undefined ? state.quote : `${state.quote}\nnote: ${state.note}`,
    };
  }
  throw new Error();
}

export function formatFactPreview(fact: ConfirmableFact): string {
  return [
    `fact ${fact.id}`,
    `citation: ${fact.citation}`,
    `url: ${fact.sourceUrl}`,
    `quote: ${fact.quote}`,
  ].join('\n');
}

/** `ingest:confirm <fact-id>`. */
export function confirmCommand(argv: readonly string[]): ConfirmCommand {
  const [raw, extra] = argv;
  // ids are lowercase; `tax:state-2026:TX` reads naturally, so fold case first
  const factId = raw?.toLowerCase();
  if (extra !== undefined || factId === undefined || !FACT_ID.test(factId)) {
    throw new Error('usage: ingest:confirm <fact-id>');
  }
  if (!confirmableIds().has(factId)) {
    if (factId.startsWith('tax:state-2026:')) {
      const drafted = stateRates2026().map((draft) => draft.state.toLowerCase());
      throw new Error(`no 2026 draft for ${factId}; drafted states: ${drafted.join(' ')}`);
    }
    throw new Error(`unknown fact ${factId}`);
  }
  return { factId };
}

/** UTC calendar date. The row stores a date, not a timestamp. */
export function confirmationDate(nowIso: string): string {
  const date = /^\d{4}-\d{2}-\d{2}/.exec(nowIso)?.[0];
  if (date === undefined) throw new Error('A confirmation date is required');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('A confirmation date is required');
  }
  return date;
}

export function formatConfirmed(factId: string, login: string, verifiedAt: string): string {
  return `fact ${factId} verified by human ${login} on ${verifiedAt}`;
}

/**
 * Records verified / by human. Does not publish the quote.
 * The preview is printed first; nothing is written unless `ask` answers yes.
 */
export async function confirmFact(
  sql: Sql,
  input: { factId: string; login: string; verifiedAt: string },
  log: (line: string) => void,
  ask: () => Promise<boolean>,
): Promise<void> {
  const command = confirmCommand([input.factId]);
  const login = requireReviewer(input.login);
  const verifiedAt = confirmationDate(input.verifiedAt);
  log(formatFactPreview(confirmableFact(command.factId)));
  if (!(await ask())) {
    log(`fact ${command.factId} not confirmed`);
    return;
  }
  const inserted = await sql.query(
    `insert into fact_confirmations (fact_id, status, verified_by, login, verified_at)
     values ($1, 'verified', 'human', $2, $3)
     on conflict (fact_id) do nothing
     returning fact_id`,
    [command.factId, login, verifiedAt],
  );
  if (inserted.rows[0] !== undefined) {
    log(formatConfirmed(command.factId, login, verifiedAt));
    return;
  }
  const stored = await sql.query(
    `select login, verified_at::text as verified_at from fact_confirmations where fact_id = $1`,
    [command.factId],
  );
  const row = stored.rows[0] ?? {};
  log(
    `${formatConfirmed(command.factId, String(row['login']), String(row['verified_at']))} (already confirmed)`,
  );
}

/** Only an explicit `y` or `yes` writes the row. */
async function askYes(): Promise<boolean> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question('Quote matches the source and proves the field? [y/N] ');
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    prompt.close();
  }
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  loadLocalEnv();
  const command = confirmCommand(process.argv.slice(2));
  const verifiedAt = confirmationDate(new Date().toISOString());
  reviewerFrom(
    process.env,
    async () => (await execFileAsync('gh', ['api', 'user', '--jq', '.login'])).stdout,
  )
    .then((login) =>
      withClient(databaseUrl(process.env), (sql) =>
        confirmFact(
          sql,
          { ...command, login, verifiedAt },
          (line) => {
            process.stdout.write(`${line}\n`);
          },
          askYes,
        ),
      ),
    )
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'ingest confirm failed';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}

/** All 28 rows of Rev. Proc. 2025-32 § 4.01 tables 1-4, one quote per bracket, by filing status. */
function federalFact(): ConfirmableFact {
  const draft = federalBrackets2026();
  const lines = draft.tables.flatMap((table) => [
    `[${table.filingStatus}] § ${table.section}`,
    ...table.brackets.map((bracket) => `  ${bracket.quote}`),
  ]);
  return {
    id: FEDERAL_2026_FACT_ID,
    citation: `Rev. Proc. 2025-32 § 4.01, IRB 2025-45, page ${String(draft.page)}`,
    sourceUrl: draft.sourceUrl,
    quote: `\n${lines.join('\n')}`,
  };
}
