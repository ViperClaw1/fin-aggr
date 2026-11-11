import { appendFileSync } from 'node:fs';

/** The one stdout line a scheduled run adds. Counts only: no rows, no secrets. */
export function formatRunLine(input: {
  id: string;
  status: string;
  rows: number;
  queued: number;
  version: string;
}): string {
  const rows = String(input.rows);
  const queued = String(input.queued);
  return `source ${input.id} ${input.status} rows=${rows} queued=${queued} version=${input.version}`;
}

export function writeStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** GitHub Actions sets `GITHUB_STEP_SUMMARY`. Local runs have no file. */
export function writeStepSummary(line: string, env: NodeJS.ProcessEnv): void {
  const path = env['GITHUB_STEP_SUMMARY'];
  if (path === undefined || path === '') return;
  appendFileSync(path, `${line}\n`);
}
