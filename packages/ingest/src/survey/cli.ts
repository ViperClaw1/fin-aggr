import { pathToFileURL } from 'node:url';
import { databaseUrl, withClient } from '../db';
import { loadLocalEnv } from '../env';
import { surveyFacts, saveSurveyRow, surveyTargets } from '../postgres/survey';
import { scrapeFetch } from '../scrape/http';
import { createScrapeSession, type ScrapeClient } from '../scrape/session';
import { siteOf } from './page';
import { formatSurveyReport, surveyReport } from './report';
import { surveyOne, type SurveyRow, type SurveyTarget } from './run';

const SURVEY_LIMIT = 500;
/** Parallel queues. Each queue owns whole sites, so the per-domain gap holds without locks. */
const QUEUES = 8;

/** Institutions that share a site go to one queue, in deposit order. */
export function queuesBySite(targets: readonly SurveyTarget[], count: number): SurveyTarget[][] {
  const queues: SurveyTarget[][] = Array.from({ length: count }, () => []);
  const owner = new Map<string, number>();
  for (const target of targets) {
    const site = siteOf(new URL(target.website).hostname);
    const index = owner.get(site) ?? owner.size % count;
    owner.set(site, index);
    queues[index]?.push(target);
  }
  return queues;
}

export async function surveyAll(input: {
  targets: readonly SurveyTarget[];
  client: ScrapeClient;
  save: (row: SurveyRow) => Promise<void>;
  now: () => string;
  log: (line: string) => void;
}): Promise<number> {
  let saved = 0;
  await Promise.all(
    queuesBySite(input.targets, QUEUES).map(async (queue) => {
      for (const target of queue) {
        const row = await surveyOne(input.client, target, input.now);
        if (row === null) {
          input.log(`survey ${target.institutionId} held reason=outside_window`);
          continue;
        }
        await input.save(row);
        saved += 1;
        input.log(
          `survey ${target.institutionId} ${row.status}${row.blockReason === null ? '' : ` reason=${row.blockReason}`}${row.errorCode === null ? '' : ` code=${row.errorCode}`}`,
        );
      }
    }),
  );
  return saved;
}

function limitOf(argv: readonly string[]): number {
  const index = argv.indexOf('--limit');
  const text = index === -1 ? undefined : argv[index + 1];
  if (text === undefined) return SURVEY_LIMIT;
  if (!/^[1-9]\d{0,3}$/.test(text)) throw new Error('--limit is a whole number up to 9999');
  return Number(text);
}

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function main(argv: readonly string[]): Promise<void> {
  const url = databaseUrl(process.env);
  if (argv[0] === 'report') {
    const facts = await withClient(url, surveyFacts);
    for (const line of formatSurveyReport(
      surveyReport(facts.rows, facts.totalDepositsUsdThousands),
    ))
      out(line);
    return;
  }
  if (argv[0] !== 'run') throw new Error('usage: survey run [--limit N] | survey report');
  const targets = await withClient(url, (sql) => surveyTargets(sql, limitOf(argv)));
  out(`survey targets=${String(targets.length)}`);
  // No onManual: a block seen by the survey is recorded here, it does not change `sources`.
  const client = createScrapeSession(process.env['FA_SCRAPE_MAILBOX'], {
    fetch: scrapeFetch,
    now: () => new Date().toISOString(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: out,
  });
  try {
    const saved = await withClient(url, (sql) =>
      surveyAll({
        targets,
        client,
        save: (row) => saveSurveyRow(sql, row),
        now: () => new Date().toISOString(),
        log: out,
      }),
    );
    out(`survey saved=${String(saved)} held=${String(targets.length - saved)}`);
  } finally {
    client.flushLoad();
  }
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  loadLocalEnv();
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'survey failed'}\n`);
    process.exitCode = 1;
  });
}
