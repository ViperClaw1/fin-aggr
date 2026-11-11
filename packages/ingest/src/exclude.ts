import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { reviewerFrom } from './cli';
import { databaseUrl, withClient } from './db';
import { loadLocalEnv } from './env';
import { excludeSource } from './postgres/sources';
import { formatExcluded, isBankSourceId } from './scrape/rules';

const execFileAsync = promisify(execFile);

export interface ExcludeCommand {
  sourceId: string;
  requestedAt: string;
}

/** `ingest:exclude <bank-id> --requested <iso>`. */
export function excludeCommand(argv: readonly string[]): ExcludeCommand {
  const [sourceId, flag, requestedAt, extra] = argv;
  if (
    extra !== undefined ||
    flag !== '--requested' ||
    sourceId === undefined ||
    requestedAt === undefined ||
    !isBankSourceId(sourceId) ||
    Number.isNaN(Date.parse(requestedAt))
  ) {
    throw new Error('usage: ingest:exclude <bank-id> --requested <iso>');
  }
  return { sourceId, requestedAt };
}

export async function applyOptOut(
  sql: Parameters<typeof excludeSource>[0],
  input: ExcludeCommand & { appliedAt: string; by: string },
  log: (line: string) => void,
): Promise<void> {
  const outcome = await excludeSource(sql, input);
  log(formatExcluded(input.sourceId, outcome === 'excluded late'));
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  loadLocalEnv();
  const command = excludeCommand(process.argv.slice(2));
  const appliedAt = new Date().toISOString();
  reviewerFrom(
    process.env,
    async () => (await execFileAsync('gh', ['api', 'user', '--jq', '.login'])).stdout,
  )
    .then((by) =>
      withClient(databaseUrl(process.env), (sql) =>
        applyOptOut(sql, { ...command, appliedAt, by }, (line) => {
          process.stdout.write(`${line}\n`);
        }),
      ),
    )
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'ingest exclude failed';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
