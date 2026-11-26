import type { PageResult, ScrapeClient } from '../scrape/session';
import { hasRatesWithoutJs, readHome } from './page';

export interface SurveyTarget {
  institutionId: string;
  website: string;
  timeZone: string;
  depositsUsdThousands: number;
  excluded: boolean;
}

export interface SurveyRow {
  institutionId: string;
  surveyedAt: string;
  depositsUsdThousands: number;
  status: 'ok' | 'blocked' | 'missing' | 'excluded' | 'error';
  blockReason: string | null;
  errorCode: string | null;
  homeUrl: string | null;
  ratesUrl: string | null;
  ratesWithoutJs: boolean | null;
  disclosurePdfUrl: string | null;
  generator: string | null;
  scriptHosts: string[];
}

const decode = (body: Uint8Array): string => new TextDecoder().decode(body);

/** A short token for the log and the row: never the error message, which may carry a URL. */
function errorCode(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  if (typeof code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(code)) return code;
  const http = error instanceof Error ? /^scrape http (\d{3})$/.exec(error.message) : null;
  return http?.[1] === undefined ? 'unknown' : `http_${http[1]}`;
}

function blank(target: SurveyTarget, now: string, status: SurveyRow['status']): SurveyRow {
  return {
    institutionId: target.institutionId,
    surveyedAt: now,
    depositsUsdThousands: target.depositsUsdThousands,
    status,
    blockReason: null,
    errorCode: null,
    homeUrl: null,
    ratesUrl: null,
    ratesWithoutJs: null,
    disclosurePdfUrl: null,
    generator: null,
    scriptHosts: [],
  };
}

/** Outcome of a page that is not 200. Null: outside the overnight window, try another night. */
function stopped(target: SurveyTarget, now: string, page: PageResult): SurveyRow | null {
  if (page.kind === 'outside_window') return null;
  if (page.kind === 'manual') return { ...blank(target, now, 'blocked'), blockReason: page.reason };
  if (page.kind === 'excluded') return blank(target, now, 'excluded');
  return blank(target, now, 'missing');
}

/**
 * Home page, then the best rates link on the same site: two requests at most, both through the
 * scrape session (robots, gap, window, block stop). Nothing is stored except this row.
 */
export async function surveyOne(
  client: ScrapeClient,
  target: SurveyTarget,
  now: () => string,
): Promise<SurveyRow | null> {
  const sourceId = `bank:${target.institutionId}`;
  const request = { sourceId, timeZone: target.timeZone, excluded: target.excluded };
  try {
    const home = await client.get({ ...request, url: target.website });
    if (home.kind !== 'ok') return stopped(target, now(), home);
    const html = decode(home.body);
    const read = readHome(html, home.url);
    const row: SurveyRow = {
      ...blank(target, now(), 'ok'),
      homeUrl: home.url,
      ratesUrl: read.ratesUrl,
      ratesWithoutJs: hasRatesWithoutJs(html) ? true : null,
      disclosurePdfUrl: read.disclosurePdfUrl,
      generator: read.fingerprint.generator,
      scriptHosts: read.fingerprint.scriptHosts,
    };
    if (read.ratesUrl === null) return row;
    const rates = await client.get({ ...request, url: read.ratesUrl });
    if (rates.kind === 'manual') return { ...row, status: 'blocked', blockReason: rates.reason };
    if (rates.kind !== 'ok') return row;
    return {
      ...row,
      ratesWithoutJs: row.ratesWithoutJs === true || hasRatesWithoutJs(decode(rates.body)),
    };
  } catch (error) {
    return { ...blank(target, now(), 'error'), errorCode: errorCode(error) };
  }
}
