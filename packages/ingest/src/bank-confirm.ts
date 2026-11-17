import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { reviewerFrom } from './cli';
import { databaseUrl, withClient } from './db';
import type { Sql } from './decisions';
import { loadLocalEnv } from './env';
import { requireReviewer } from './policy';
import { confirmBank } from './postgres/bank-products';
import { PILOT_IDS } from './scrape/banks/pilot';

const execFileAsync = promisify(execFile);

function allowedSource(sourceId: string): boolean {
  return PILOT_IDS.some((id) => `bank:${id}` === sourceId);
}

/** `ingest:confirm-bank bank:fdic:<cert>`. */
export function confirmBankCommand(argv: readonly string[]): { sourceId: string } {
  const [sourceId, extra] = argv;
  if (extra !== undefined || sourceId === undefined || !allowedSource(sourceId)) {
    throw new Error('usage: ingest:confirm-bank bank:fdic:<cert>');
  }
  return { sourceId };
}

/** UTC calendar date. The row stores a date, not a timestamp. */
export function confirmationDay(nowIso: string): string {
  const date = /^\d{4}-\d{2}-\d{2}/.exec(nowIso)?.[0];
  if (date === undefined) throw new Error('A confirmation date is required');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('A confirmation date is required');
  }
  return date;
}

export function formatBankConfirmed(sourceId: string, login: string, verifiedAt: string): string {
  return `bank ${sourceId} verified by human ${login} on ${verifiedAt}`;
}

/** Records the human confirmation. The next scrape publishes clean rows. This call does not. */
export async function confirmPilotBank(
  sql: Sql,
  input: { sourceId: string; login: string; verifiedAt: string },
  log: (line: string) => void,
): Promise<void> {
  const command = confirmBankCommand([input.sourceId]);
  const login = requireReviewer(input.login);
  const verifiedAt = confirmationDay(input.verifiedAt);
  const state = await confirmBank(sql, { sourceId: command.sourceId, login, verifiedAt });
  const line = formatBankConfirmed(command.sourceId, state.login, state.verifiedAt);
  log(state.created ? line : `${line} (already confirmed)`);
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  loadLocalEnv();
  const command = confirmBankCommand(process.argv.slice(2));
  const verifiedAt = confirmationDay(new Date().toISOString());
  reviewerFrom(process.env, async () =>
    (await execFileAsync('gh', ['api', 'user', '--jq', '.login'])).stdout.trim(),
  )
    .then((login) =>
      withClient(databaseUrl(process.env), (sql) =>
        confirmPilotBank(sql, { ...command, login, verifiedAt }, (line) => {
          process.stdout.write(`${line}\n`);
        }),
      ),
    )
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'bank confirm failed';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
