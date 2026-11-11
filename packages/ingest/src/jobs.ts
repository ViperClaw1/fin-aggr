import { fdicInstitutionsSource } from './fdic/institutions';
import { prepareFdicSource, institutionPorts } from './postgres/ports';
import { runSource } from './pipeline';
import { formatRunLine, writeStdout, writeStepSummary } from './run-line';
import { registerJob } from './schedule';

/** Step 6 wires a connector. A second call is a mistake: registerJob refuses a duplicate. */
export function registerConnectors(): void {
  registerJob('fdic-institutions', (env) => runFdicInstitutions(env));
}

async function runFdicInstitutions(env: NodeJS.ProcessEnv): Promise<void> {
  const now = (): string => new Date().toISOString();
  const source = fdicInstitutionsSource(now);
  await prepareFdicSource(env);
  const summary = await runSource(source, institutionPorts(env, now), writeStdout);
  const version = summary.versionId === null ? '-' : String(summary.versionId);
  const line = formatRunLine({
    id: source.id,
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
    writeStdout(`source ${source.id} failed stage=revalidate status=${status}`);
    throw new Error(`source ${source.id} revalidate failed`);
  }
  if (summary.status === 'published' && summary.versionId === null) {
    throw new Error(`source ${source.id} published without a version`);
  }
  if (summary.status === 'failed') throw new Error(`source ${source.id} failed`);
}
