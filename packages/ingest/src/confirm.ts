import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { reviewerFrom } from './cli';
import { databaseUrl, withClient } from './db';
import type { Sql } from './decisions';
import { loadLocalEnv } from './env';
import { insuranceLimitQuotes } from './insurance/limit';
import { requireReviewer } from './policy';
import { treasuryProductGaps } from './treasury/product-gaps';

const execFileAsync = promisify(execFile);

const FACT_ID = /^[a-z0-9][a-z0-9:_-]{0,63}$/;

export interface ConfirmCommand {
  factId: string;
}

function confirmableIds(): Set<string> {
  return new Set([
    ...insuranceLimitQuotes().map((quote) => quote.id),
    ...treasuryProductGaps().map((gap) => gap.id),
  ]);
}

/** `ingest:confirm <fact-id>`. */
export function confirmCommand(argv: readonly string[]): ConfirmCommand {
  const [factId, extra] = argv;
  if (extra !== undefined || factId === undefined || !FACT_ID.test(factId)) {
    throw new Error('usage: ingest:confirm <fact-id>');
  }
  if (!confirmableIds().has(factId)) throw new Error(`unknown fact ${factId}`);
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

/** Records verified / by human. Does not publish the quote. */
export async function confirmFact(
  sql: Sql,
  input: { factId: string; login: string; verifiedAt: string },
  log: (line: string) => void,
): Promise<void> {
  const command = confirmCommand([input.factId]);
  const login = requireReviewer(input.login);
  const verifiedAt = confirmationDate(input.verifiedAt);
  const inserted = await sql.query(
    `insert into fact_confirmations (fact_id, status, verified_by, login, verified_at)
     values ($1, 'verified', 'human', $2, $3)
     on conflict (fact_id) do nothing
     returning fact_id`,
    [command.factId, login, verifiedAt],
  );
  if (inserted.rows[0] === undefined) {
    throw new Error(`fact ${command.factId} is already confirmed`);
  }
  log(formatConfirmed(command.factId, login, verifiedAt));
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
        confirmFact(sql, { ...command, login, verifiedAt }, (line) => {
          process.stdout.write(`${line}\n`);
        }),
      ),
    )
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'ingest confirm failed';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
