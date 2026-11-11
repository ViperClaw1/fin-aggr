import { pathToFileURL } from 'node:url';
import { loadLocalEnv } from './env';
import { registerConnectors } from './jobs';
import { runScheduled } from './schedule';

export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  log: (line: string) => void,
): Promise<void> {
  const id = argv[0];
  if (id === undefined || argv.length !== 1) throw new Error('usage: ingest:run <source-id>');
  registerConnectors();
  await runScheduled(id, env, log);
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  loadLocalEnv();
  main(process.argv.slice(2), process.env, (line) => {
    process.stdout.write(`${line}\n`);
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'ingest run failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
