import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { reviewerFrom } from './cli';
import { databaseUrl, withClient } from './db';
import { loadLocalEnv } from './env';
import { resumeSource } from './postgres/sources';

const execFileAsync = promisify(execFile);

export interface ResumeCommand {
  sourceId: string;
  reason: string;
}

/** `ingest:resume <source-id> --reason <text>`. */
export function resumeCommand(argv: readonly string[]): ResumeCommand {
  const [sourceId, flag, reason, extra] = argv;
  if (
    extra !== undefined ||
    flag !== '--reason' ||
    sourceId === undefined ||
    sourceId === '' ||
    reason === undefined ||
    reason.trim() === ''
  ) {
    throw new Error('usage: ingest:resume <source-id> --reason <text>');
  }
  return { sourceId, reason };
}

export async function applyResume(
  sql: Parameters<typeof resumeSource>[0],
  input: ResumeCommand & { by: string },
  log: (line: string) => void,
): Promise<void> {
  await resumeSource(sql, input);
  log(`source ${input.sourceId} resumed`);
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  loadLocalEnv();
  const command = resumeCommand(process.argv.slice(2));
  reviewerFrom(
    process.env,
    async () => (await execFileAsync('gh', ['api', 'user', '--jq', '.login'])).stdout,
  )
    .then((by) =>
      withClient(databaseUrl(process.env), (sql) =>
        applyResume(sql, { ...command, by }, (line) => {
          process.stdout.write(`${line}\n`);
        }),
      ),
    )
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'ingest resume failed';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
