import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { databaseUrl, withClient } from '../../db';
import { enqueueReview } from '../../decisions';
import { loadLocalEnv } from '../../env';
import { sha256Hex } from '../../pipeline';
import { insertProposal, proposalReason } from '../../postgres/adapter-configs';
import { upsertBankSources } from '../../postgres/banks';
import { saveInstitutionSnapshot } from '../../postgres/ports';
import { scrapeFetch } from '../http';
import { stateTimeZone } from '../registry';
import { assertPublicPage } from '../rules';
import { createScrapeSession } from '../session';
import { proposeAdapter, type Bank } from './propose';

/**
 * `pnpm ingest:onboard <institution-id> [rates-url]` (plan 8.6). One page through the scrape
 * session (robots, gap, overnight window), its snapshot in `raw`, one model call, one
 * `adapter_configs` row and one review row. Nothing is published; `pnpm ingest:approve <id>`
 * makes the config active for the next bank-rates run.
 */

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function bankOf(env: NodeJS.ProcessEnv, institutionId: string, url?: string): Promise<Bank> {
  return withClient(databaseUrl(env), async (sql) => {
    const found = await sql.query(
      `select i.name, i.hq_state,
              (select s.rates_url from survey_results s
               where s.institution_id = i.id and s.rates_url is not null
               order by s.surveyed_at desc limit 1) as rates_url
       from institutions i
       join dataset_versions v on v.id = i.version_id and v.domain = 'institutions' and v.is_current
       where i.id = $1`,
      [institutionId],
    );
    const row = found.rows[0];
    if (row === undefined) throw new Error(`${institutionId} is not in the current directory`);
    const page = url ?? (typeof row['rates_url'] === 'string' ? row['rates_url'] : null);
    if (page === null) throw new Error(`${institutionId} has no rates url; pass one`);
    return {
      institutionId,
      bankName: String(row['name']),
      url: assertPublicPage(page).href,
      timeZone: stateTimeZone(String(row['hq_state'])),
    };
  });
}

async function main(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  const [institutionId, url] = argv;
  if (institutionId === undefined || !/^(fdic|ncua):\d+$/.test(institutionId)) {
    throw new Error('usage: ingest:onboard <fdic:N|ncua:N> [rates-url]');
  }
  if ((env['ANTHROPIC_API_KEY']?.trim() ?? '') === '')
    throw new Error('ANTHROPIC_API_KEY is missing');
  const bank = await bankOf(env, institutionId, url);
  const sourceId = `bank:${institutionId}`;
  await withClient(databaseUrl(env), (sql) =>
    upsertBankSources(sql, [
      {
        sourceId,
        institutionId,
        name: bank.bankName,
        url: bank.url,
        timeZone: bank.timeZone,
        cohort: 'deposits',
        ratesChannel: 'unchecked',
      },
    ]),
  );
  const session = createScrapeSession(env['FA_SCRAPE_MAILBOX'], {
    fetch: scrapeFetch,
    now: () => new Date().toISOString(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: out,
  });
  const page = await session.get({
    sourceId,
    url: bank.url,
    timeZone: bank.timeZone,
    excluded: false,
  });
  session.flushLoad();
  if (page.kind !== 'ok') {
    out(`onboard ${institutionId} held reason=${page.kind === 'manual' ? page.reason : page.kind}`);
    return;
  }
  const { snapshotId } = await saveInstitutionSnapshot(env, {
    sourceId,
    sha256: sha256Hex(page.body),
    bytes: page.body,
  });
  const client = new Anthropic();
  const proposal = await proposeAdapter({
    create: (params) => client.beta.messages.create(params),
    bank,
    html: new TextDecoder().decode(page.body),
  });
  const queueId = await withClient(databaseUrl(env), async (sql) => {
    const id = await insertProposal(sql, { institutionId, snapshotId, proposal });
    const queued = await enqueueReview(sql, {
      sourceId,
      domain: 'bank_products',
      snapshotId,
      reason: proposalReason(id, proposal.failures),
    });
    return queued.queueId;
  });
  out(
    `onboard ${institutionId} review=${String(queueId)} products=${String(proposal.products.length)} failures=${proposal.failures.length === 0 ? 'none' : proposal.failures.join(',')} tokens_in=${String(proposal.usage.inputTokens)} tokens_out=${String(proposal.usage.outputTokens)}`,
  );
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  loadLocalEnv();
  main(process.argv.slice(2), process.env).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'onboard failed'}\n`);
    process.exitCode = 1;
  });
}
