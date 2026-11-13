import { fdicFinancialsSource } from './fdic/financials-fetch';
import { fdicInstitutionsSource } from './fdic/institutions';
import { ecfrWatchSource } from './ecfr/watch';
import {
  prepareFdicSource,
  institutionPorts,
  parYieldPorts,
  prepareParYieldSource,
  financialPorts,
  loadInstitutionIds,
  prepareFinancialsSource,
  prepareWatchSources,
  watchPorts,
} from './postgres/ports';
import { runSource, type RunSummary } from './pipeline';
import { federalRegisterSource } from './register/watch';
import { formatRunLine, formatStageFailure, writeStdout, writeStepSummary } from './run-line';
import { registerJob } from './schedule';
import { parYieldSource } from './treasury/par-yield';
import { formatWatchLine, runWatchSource } from './watch';

/** Step 6 wires a connector. A second call is a mistake: registerJob refuses a duplicate. */
export function registerConnectors(): void {
  registerJob('fdic-institutions', (env) => runFdicInstitutions(env));
  registerJob('fdic-financials', (env) => runFdicFinancials(env));
  registerJob('treasury-par-yield', (env) => runParYield(env));
  registerJob('ecfr-330', (env) => runEcfr(env, '330'));
  registerJob('ecfr-745', (env) => runEcfr(env, '745'));
  registerJob('ecfr-328', (env) => runEcfr(env, '328'));
  registerJob('federal-register', (env) => runFederalRegister(env));
}

function reportRun(id: string, summary: RunSummary, env: NodeJS.ProcessEnv): void {
  if (summary.watch !== undefined) {
    const line = formatWatchLine(id, summary.watch);
    writeStdout(line);
    writeStepSummary(line, env);
    return;
  }
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

async function runEcfr(env: NodeJS.ProcessEnv, part: '328' | '330' | '745'): Promise<void> {
  const now = (): string => new Date().toISOString();
  await prepareWatchSources(env);
  const source = ecfrWatchSource(part);
  reportRun(source.id, await runWatchSource(source, watchPorts(env, now), writeStdout), env);
}

async function runFederalRegister(env: NodeJS.ProcessEnv): Promise<void> {
  const now = (): string => new Date().toISOString();
  await prepareWatchSources(env);
  const source = federalRegisterSource();
  reportRun(source.id, await runWatchSource(source, watchPorts(env, now), writeStdout), env);
}
