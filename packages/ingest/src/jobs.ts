import { fdicFinancialsSource } from './fdic/financials-fetch';
import { fdicInstitutionsSource } from './fdic/institutions';
import {
  prepareFdicSource,
  institutionPorts,
  parYieldPorts,
  prepareParYieldSource,
  financialPorts,
  loadInstitutionIds,
  prepareFinancialsSource,
} from './postgres/ports';
import { runSource, type RunSummary } from './pipeline';
import { formatRunLine, formatStageFailure, writeStdout, writeStepSummary } from './run-line';
import { registerJob } from './schedule';
import { parYieldSource } from './treasury/par-yield';

/** Step 6 wires a connector. A second call is a mistake: registerJob refuses a duplicate. */
export function registerConnectors(): void {
  registerJob('fdic-institutions', (env) => runFdicInstitutions(env));
  registerJob('fdic-financials', (env) => runFdicFinancials(env));
  registerJob('treasury-par-yield', (env) => runParYield(env));
}

function reportRun(id: string, summary: RunSummary, env: NodeJS.ProcessEnv): void {
  const version = summary.versionId === null ? '-' : String(summary.versionId);
  const line = formatRunLine({
    id,
    status: summary.status,
    rows: summary.published,
    queued: summary.queued,
    version,
    ...(summary.revalidateStatus === null ? {} : { revalidate: 'failed' as const }),
  });
  writeStdout(line);
  writeStepSummary(line, env);
  if (summary.revalidateStatus !== null) {
    const status = String(summary.revalidateStatus);
    writeStdout(`source ${id} failed stage=revalidate status=${status}`);
    throw new Error(`source ${id} revalidate failed`);
  }
  if (summary.status === 'published' && summary.versionId === null) {
    throw new Error(`source ${id} published without a version`);
  }
  if (summary.status === 'failed') {
    const stageLine = formatStageFailure(
      id,
      summary.failure?.stage ?? 'failed',
      summary.failure?.code ?? 'failed',
    );
    writeStepSummary(stageLine, env);
    throw new Error(stageLine);
  }
}

async function runFdicInstitutions(env: NodeJS.ProcessEnv): Promise<void> {
  const now = (): string => new Date().toISOString();
  const source = fdicInstitutionsSource(now);
  await prepareFdicSource(env);
  reportRun(source.id, await runSource(source, institutionPorts(env, now), writeStdout), env);
}

async function runFdicFinancials(env: NodeJS.ProcessEnv): Promise<void> {
  const now = (): string => new Date().toISOString();
  await prepareFinancialsSource(env);
  const source = fdicFinancialsSource(now, await loadInstitutionIds(env));
  reportRun(source.id, await runSource(source, financialPorts(env, now), writeStdout), env);
}

async function runParYield(env: NodeJS.ProcessEnv): Promise<void> {
  const now = (): string => new Date().toISOString();
  const source = parYieldSource(now);
  await prepareParYieldSource(env);
  reportRun(source.id, await runSource(source, parYieldPorts(env, now), writeStdout), env);
}
