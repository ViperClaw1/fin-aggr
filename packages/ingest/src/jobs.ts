import { amexCdWatchSource, AMEX_CD_PAGE_URL } from './banks/amex-cd-watch';
import { fdicFinancialsSource } from './fdic/financials-fetch';
import { fdicInstitutionsSource } from './fdic/institutions';
import { ecfrWatchSource } from './ecfr/watch';
import { nationalRatesSource } from './fred/national';
import { ncuaSource } from './ncua/source';
import { auctionPorts, nationalRatesPorts, ncuaPorts } from './postgres/gov-ports';
import {
  prepareAuctionSources,
  prepareFdicSource,
  institutionPorts,
  parYieldPorts,
  prepareNationalRatesSource,
  prepareNcuaSource,
  prepareParYieldSource,
  financialPorts,
  loadInstitutionIds,
  prepareFinancialsSource,
  prepareWatchSources,
  watchPorts,
  finishJob,
  sourceRequestedSince,
} from './postgres/ports';
import { runSource, type RunSummary } from './pipeline';
import { markSourceManualFromEnv } from './postgres/sources';
import { federalRegisterSource } from './register/watch';
import { formatRunLine, formatStageFailure, writeStdout, writeStepSummary } from './run-line';
import { registerPilotBanks } from './scrape/banks/register';
import { databaseUrl, withClient } from './db';
import { CodedError, jobRecord } from './fetch-budget';
import { scrapeFetch } from './scrape/http';
import { overnightWindowStart, utcWeekStart } from './scrape/rules';
import { createScrapeSession, type ScrapeClient } from './scrape/session';
import { registerAfterBanks, registerJob } from './schedule';
import { parYieldSource } from './treasury/par-yield';
import { directGap, fiscalGap, runAuctionGap } from './treasury/gap';
import { formatWatchLine, runWatchSource } from './watch';

/** Step 6 wires a connector. A second call is a mistake: registerJob refuses a duplicate. */
export function registerConnectors(): void {
  registerJob('fdic-institutions', (env) => runFdicInstitutions(env));
  registerJob('fdic-financials', (env) => runFdicFinancials(env));
  registerJob('ncua-5300', (env) => runNcua(env));
  registerJob('fdic-national-rates', (env) => runNationalRates(env));
  registerJob('treasury-fiscal-data', (env) => runFiscal(env));
  registerJob('treasurydirect', (env) => runTreasuryDirect(env));
  registerJob('treasury-par-yield', (env) => runParYield(env));
  registerJob('ecfr-330', (env) => runEcfr(env, '330'));
  registerJob('ecfr-745', (env) => runEcfr(env, '745'));
  registerJob('ecfr-328', (env) => runEcfr(env, '328'));
  registerJob('federal-register', (env) => runFederalRegister(env));
  registerJob('amex-cd-page', (env) => runAmexCdPage(env));
  registerAfterBanks((env, session) => runAmexCdPage(env, session));
  registerPilotBanks();
}

function reportRun(id: string, summary: RunSummary, env: NodeJS.ProcessEnv): void {
  if (summary.watch !== undefined) {
    recordLine(formatWatchLine(id, summary.watch), env);
    return;
  }
  recordLine(publishLine(id, summary), env);
  assertFinished(id, summary, env);
}

function recordLine(line: string, env: NodeJS.ProcessEnv): void {
  writeStdout(line);
  writeStepSummary(line, env);
}

function publishLine(id: string, summary: RunSummary): string {
  const version = summary.versionId === null ? '-' : String(summary.versionId);
  const reason = runReason(summary);
  return formatRunLine({
    id,
    status: summary.status,
    rows: summary.published,
    queued: summary.queued,
    version,
    ...(summary.revalidateStatus === null ? {} : { revalidate: 'failed' as const }),
    ...(reason === undefined ? {} : { reason }),
  });
}

function runReason(summary: RunSummary): string | undefined {
  if (summary.status === 'held') return summary.holdReason ?? 'unchanged';
  if (summary.status === 'failed') return summary.holdReason;
  return undefined;
}

function assertFinished(id: string, summary: RunSummary, env: NodeJS.ProcessEnv): void {
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

async function runNcua(env: NodeJS.ProcessEnv): Promise<void> {
  const now = (): string => new Date().toISOString();
  const source = ncuaSource(now);
  await prepareNcuaSource(env);
  reportRun(source.id, await runSource(source, ncuaPorts(env, now), writeStdout), env);
}

async function runNationalRates(env: NodeJS.ProcessEnv): Promise<void> {
  const now = (): string => new Date().toISOString();
  const source = nationalRatesSource(now, env['FRED_API_KEY'] ?? '');
  await prepareNationalRatesSource(env);
  reportRun(source.id, await runSource(source, nationalRatesPorts(env, now), writeStdout), env);
}

async function runFiscal(env: NodeJS.ProcessEnv): Promise<void> {
  const now = (): string => new Date().toISOString();
  await prepareAuctionSources(env);
  reportRun(
    'treasury-fiscal-data',
    await runAuctionGap(fiscalGap(), auctionPorts(env, now), writeStdout),
    env,
  );
}

async function runTreasuryDirect(env: NodeJS.ProcessEnv): Promise<void> {
  const now = (): string => new Date().toISOString();
  await prepareAuctionSources(env);
  reportRun(
    'treasurydirect',
    await runAuctionGap(directGap(), auctionPorts(env, now), writeStdout),
    env,
  );
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

async function runAmexCdPage(env: NodeJS.ProcessEnv, session?: ScrapeClient): Promise<void> {
  if (session !== undefined) {
    await watchAmexCdPage(env, session);
    return;
  }
  const own = createScrapeSession(env['FA_SCRAPE_MAILBOX'], {
    fetch: scrapeFetch,
    now: () => new Date().toISOString(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: writeStdout,
    onManual: (sourceId, reason) => markSourceManualFromEnv(env, sourceId, reason),
  });
  try {
    await watchAmexCdPage(env, own);
  } finally {
    own.flushLoad();
  }
}

async function watchAmexCdPage(env: NodeJS.ProcessEnv, session: ScrapeClient): Promise<void> {
  const now = (): string => new Date().toISOString();
  const startedAt = now();
  if (overnightWindowStart(startedAt, 'America/Denver') === null) {
    writeStdout('source amex-cd-page held reason=outside_window');
    return;
  }
  await prepareWatchSources(env);
  const fetched = await withClient(databaseUrl(env), (sql) =>
    sourceRequestedSince(sql, 'amex-cd-page', utcWeekStart(startedAt)),
  );
  if (fetched) {
    writeStdout('source amex-cd-page held reason=already_fetched');
    await withClient(databaseUrl(env), (sql) =>
      finishJob(
        sql,
        jobRecord({
          source: { id: 'amex-cd-page', domain: 'bank_products' },
          startedAt,
          endedAt: now(),
          status: 'held',
          rowCount: 0,
          errors: ['already_fetched'],
          bytes: 0,
          requestCount: 0,
        }),
      ),
    );
    return;
  }
  const source = amexCdWatchSource(async () => {
    const page = await session.get({
      sourceId: 'amex-cd-page',
      url: AMEX_CD_PAGE_URL,
      timeZone: 'America/Denver',
      excluded: false,
    });
    if (page.kind === 'manual') throw new CodedError(page.reason);
    if (page.kind !== 'ok') throw new CodedError(page.kind);
    return new TextDecoder().decode(page.body);
  });
  reportRun(source.id, await runWatchSource(source, watchPorts(env, now), writeStdout), env);
}

async function runFederalRegister(env: NodeJS.ProcessEnv): Promise<void> {
  const now = (): string => new Date().toISOString();
  await prepareWatchSources(env);
  const source = federalRegisterSource();
  reportRun(source.id, await runWatchSource(source, watchPorts(env, now), writeStdout), env);
}
