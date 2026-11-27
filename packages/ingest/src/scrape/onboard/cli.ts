import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { databaseUrl, withClient } from '../../db';
import { enqueueReview, withTransaction, type Sql } from '../../decisions';
import { loadLocalEnv } from '../../env';
import { sha256Hex } from '../../pipeline';
import {
  activateProposal,
  AUTOMATED,
  confirmAutomatically,
  insertProposal,
  institutionTemplate,
  proposalReason,
  templateState,
} from '../../postgres/adapter-configs';
import { upsertBankSources } from '../../postgres/banks';
import { readTableConfig } from '../banks/config';
import { saveInstitutionSnapshot } from '../../postgres/ports';
import { scrapeFetch } from '../http';
import { stateTimeZone } from '../registry';
import { assertPublicPage } from '../rules';
import { createScrapeSession } from '../session';
import { publicationHolds } from './policy';
import { proposeAdapter, type Bank, type Proposal } from './propose';

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
  const html = new TextDecoder().decode(page.body);
  const outcome = await withClient(databaseUrl(env), (sql) =>
    storeProposal(sql, { institutionId, sourceId, snapshotId, proposal, html }),
  );
  out(
    `onboard ${institutionId} ${outcome} products=${String(proposal.products.length)} failures=${proposal.failures.length === 0 ? 'none' : proposal.failures.join(',')} tokens_in=${String(proposal.usage.inputTokens)} tokens_out=${String(proposal.usage.outputTokens)}`,
  );
}

/**
 * ADR-026 policy: no hold → the config is active and the bank and its products are confirmed
 * by `automated_check` in one transaction; the next bank-rates run publishes. Otherwise a review.
 */
export async function storeProposal(
  sql: Sql,
  input: {
    institutionId: string;
    sourceId: string;
    snapshotId: number;
    proposal: Proposal;
    html: string;
    now?: () => string;
    /** Tests only: the checks still to land (default `PENDING_CHECKS`). */
    pending?: readonly string[];
  },
): Promise<string> {
  const { institutionId, sourceId, snapshotId, proposal } = input;
  const now = input.now ?? (() => new Date().toISOString());
  const template = await institutionTemplate(sql, institutionId);
  const holds = publicationHolds({
    failures: proposal.failures,
    ...(await templateState(sql, template)),
    ...(input.pending === undefined ? {} : { pending: input.pending }),
  });
  const id = await insertProposal(sql, { institutionId, snapshotId, proposal, template });
  if (holds.length > 0 || proposal.config === null) {
    const queued = await enqueueReview(sql, {
      sourceId,
      domain: 'bank_products',
      snapshotId,
      reason: proposalReason(id, holds),
    });
    return `review=${String(queued.queueId)} template=${template}`;
  }
  const productIds = readTableConfig(proposal.config, input.html).products.map((p) => p.id);
  const decidedAt = now();
  await withTransaction(sql, async (tx) => {
    await activateProposal(tx, { id, login: AUTOMATED, decidedAt });
    await confirmAutomatically(tx, {
      sourceId,
      productIds,
      verifiedAt: decidedAt.slice(0, 10),
      snapshotId,
    });
  });
  return `automated config=${String(id)} template=${template}`;
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
