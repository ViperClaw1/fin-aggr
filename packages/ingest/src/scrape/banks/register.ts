import { sha256Hex } from '../../pipeline';
import { databaseUrl, withClient } from '../../db';
import { writeStdout } from '../../run-line';
import {
  bankConfirmation,
  commitBankProducts,
  confirmedProductIds,
  previousBankProducts,
} from '../../postgres/bank-products';
import { finishJob, saveInstitutionSnapshot, sourceRequestedSince } from '../../postgres/ports';
import { markSourceManualFromEnv } from '../../postgres/sources';
import { upsertBankSources } from '../../postgres/banks';
import { registerBank } from '../../schedule';
import { AMEX_ORIGIN, AMEX_REFERER } from '../../banks/amex-fetch';
import { runBankPage, type BankPorts } from './run';
import { allyAdapter, readAlly } from './57803';
import { readAmex, amexAdapter } from './27471';
import { readSallie, sallieAdapter } from './58177';

interface BankSpec {
  sourceId: string;
  institutionId: string;
  name: string;
  url: string;
  timeZone: string;
}

function portsFor(env: NodeJS.ProcessEnv, spec: BankSpec): BankPorts {
  const url = databaseUrl(env);
  return {
    confirmation: () => withClient(url, (sql) => bankConfirmation(sql, spec.sourceId)),
    previous: () => withClient(url, (sql) => previousBankProducts(sql, spec.institutionId)),
    confirmedIds: () => withClient(url, (sql) => confirmedProductIds(sql, spec.sourceId)),
    saveSnapshot: async (bytes) => {
      const saved = await saveInstitutionSnapshot(env, {
        sourceId: spec.sourceId,
        sha256: sha256Hex(bytes),
        bytes,
      });
      return saved.snapshotId;
    },
    commit: (input) => withClient(url, (sql) => commitBankProducts(sql, input)),
    markManual: (reason) => markSourceManualFromEnv(env, spec.sourceId, reason),
    requestedSince: (windowStart) =>
      withClient(url, (sql) => sourceRequestedSince(sql, spec.sourceId, windowStart)),
    finishJob: (job) =>
      withClient(url, (sql) =>
        finishJob(sql, {
          sourceId: spec.sourceId,
          domain: 'bank_products',
          ...job,
        }),
      ),
  };
}

async function ensureBank(env: NodeJS.ProcessEnv, spec: BankSpec): Promise<boolean> {
  return withClient(databaseUrl(env), async (sql) => {
    await upsertBankSources(sql, [
      {
        sourceId: spec.sourceId,
        institutionId: spec.institutionId,
        name: spec.name,
        url: spec.url,
        timeZone: spec.timeZone,
        cohort: 'pilot',
        ratesChannel: 'unchecked',
      },
    ]);
    const result = await sql.query(`select excluded from sources where id = $1`, [spec.sourceId]);
    return result.rows[0]?.['excluded'] === true;
  });
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** Every bank shares the session the schedule opened (one transport, `scrapeFetch`). */
async function runHtmlBank(
  env: NodeJS.ProcessEnv,
  client: Parameters<typeof runBankPage>[0]['client'],
  spec: BankSpec,
  read: (text: string) => ReturnType<typeof readAlly>,
): Promise<void> {
  const excluded = await ensureBank(env, spec);
  const now = () => new Date().toISOString();
  const retrievedDay = dayOf(now());
  await runBankPage({
    client,
    request: { sourceId: spec.sourceId, url: spec.url, timeZone: spec.timeZone, excluded },
    institutionId: spec.institutionId,
    retrievedDay,
    read,
    ports: portsFor(env, spec),
    log: writeStdout,
    now,
  });
}

/** The three owner banks. A second call is refused by `registerBank`. */
export function registerPilotBanks(): void {
  registerBank(allyAdapter.sourceId, (env, client) =>
    runHtmlBank(
      env,
      client,
      {
        sourceId: allyAdapter.sourceId,
        institutionId: allyAdapter.institutionId,
        name: 'Ally Bank',
        url: allyAdapter.url,
        timeZone: allyAdapter.timeZone,
      },
      readAlly,
    ),
  );
  registerBank(sallieAdapter.sourceId, (env, client) =>
    runHtmlBank(
      env,
      client,
      {
        sourceId: sallieAdapter.sourceId,
        institutionId: sallieAdapter.institutionId,
        name: 'Sallie Mae Bank',
        url: sallieAdapter.url,
        timeZone: sallieAdapter.timeZone,
      },
      readSallie,
    ),
  );
  registerBank(amexAdapter.sourceId, async (env, client) => {
    const spec: BankSpec = {
      sourceId: amexAdapter.sourceId,
      institutionId: amexAdapter.institutionId,
      name: 'American Express National Bank',
      url: amexAdapter.url,
      timeZone: amexAdapter.timeZone,
    };
    const excluded = await ensureBank(env, spec);
    const now = () => new Date().toISOString();
    const retrievedDay = dayOf(now());
    await runBankPage({
      client,
      request: {
        sourceId: spec.sourceId,
        url: spec.url,
        timeZone: spec.timeZone,
        excluded,
        headers: { origin: AMEX_ORIGIN, referer: AMEX_REFERER },
      },
      institutionId: spec.institutionId,
      retrievedDay,
      read: (text) => readAmex(text, retrievedDay),
      ports: portsFor(env, spec),
      log: writeStdout,
      now,
    });
  });
}
