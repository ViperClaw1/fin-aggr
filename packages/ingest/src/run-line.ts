import { appendFileSync } from 'node:fs';

/** The one stdout line a scheduled run adds. Counts only: no rows, no secrets. */
export function formatRunLine(input: {
  id: string;
  status: string;
  rows: number;
  queued: number;
  version: string;
  revalidate?: 'failed';
  /** Present on every held line: unchanged, queued:<reason>, missing_fields:<list>, blocked:<reason>. */
  reason?: string;
}): string {
  const rows = String(input.rows);
  const queued = String(input.queued);
  const cache = input.revalidate === 'failed' ? ' revalidate=failed' : '';
  const reason = input.reason === undefined ? '' : ` reason=${input.reason}`;
  return `source ${input.id} ${input.status} rows=${rows} queued=${queued} version=${input.version}${cache}${reason}`;
}

/** Counts and a code only. The message, the URL, and the payload stay out of the log. */
export function formatStageFailure(id: string, stage: string, code: string): string {
  return `source ${id} failed stage=${stage} code=${code}`;
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
