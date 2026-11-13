import { sha256Hex, type Source } from '../pipeline';
import { validateFdicFinancials } from '../fdic/financials';
import type { ValidationReport } from '../validate';
import { parseNcuaQuarter, type NcuaRaw, type NcuaRow } from './parse';

const INDEX = 'https://ncua.gov/analysis/credit-union-corporate-call-report-data/quarterly-data';

export const NCUA_USER_AGENT = 'FA (+https://fin-aggr.vercel.app)';

const ZIP = /\/files\/publications\/analysis\/call-report-data-(\d{4})-(\d{2})\.zip/g;

/** Newest final quarter linked from the quarterly-data page. */
export function newestQuarterUrl(html: string): string | null {
  let best: { key: number; path: string } | null = null;
  for (const match of html.matchAll(ZIP)) {
    const year = match[1];
    const month = match[2];
    const path = match[0];
    if (year === undefined || month === undefined) continue;
    const key = Number(year) * 100 + Number(month);
    if (best === null || key > best.key) best = { key, path };
  }
  return best === null ? null : `https://ncua.gov${best.path}`;
}

async function fetchNcuaQuarter(input: {
  fetchImpl: typeof fetch;
  requestSignal: () => AbortSignal;
  retrievedAt: string;
}): Promise<{ sha256: string; bytes: Uint8Array; body: NcuaRaw; requestCount: number }> {
  const index = await input.fetchImpl(INDEX, {
    signal: input.requestSignal(),
    headers: { accept: 'text/html', 'user-agent': NCUA_USER_AGENT },
  });
  if (!index.ok) throw new Error(`ncua index http ${String(index.status)}`);
  const sourceUrl = newestQuarterUrl(await index.text());
  if (sourceUrl === null) throw new Error('ncua index has no quarter');
  const file = await input.fetchImpl(sourceUrl, {
    signal: input.requestSignal(),
    headers: { accept: 'application/zip', 'user-agent': NCUA_USER_AGENT },
  });
  if (!file.ok) throw new Error(`ncua zip http ${String(file.status)}`);
  const zip = new Uint8Array(await file.arrayBuffer());
  return {
    sha256: sha256Hex(zip),
    bytes: zip,
    body: { retrievedAt: input.retrievedAt, sourceUrl, zip },
    requestCount: 2,
  };
}

function validateNcua(
  rows: readonly NcuaRow[],
  previous: readonly NcuaRow[],
  asOf: string,
): ValidationReport<NcuaRow> {
  if (rows.length === 0) return { clean: [], suspicious: [], blocked: 'empty' };
  const reports = rows.flatMap((row) => (row.report === null ? [] : [row.report]));
  const prior = previous.flatMap((row) => (row.report === null ? [] : [row.report]));
  if (reports.length === 0) return { clean: [], suspicious: [], blocked: 'empty' };
  const checked = validateFdicFinancials(reports, prior, asOf);
  if (checked.blocked !== null) return { clean: [], suspicious: [], blocked: checked.blocked };
  const byId = new Map(checked.clean.map((row) => [row.report.institutionId, row]));
  return {
    clean: rows.map((row) => ({
      ...row,
      report:
        row.report === null ? null : (byId.get(row.report.report.institutionId) ?? row.report),
    })),
    suspicious: [],
    blocked: null,
  };
}

export function ncuaSource(now: () => string): Source<NcuaRaw, NcuaRow> {
  let asOf = now().slice(0, 10);
  return {
    id: 'ncua-5300',
    domain: 'institutions',
    kind: 'official_api',
    requestTimeoutMs: 120_000,
    fetchBudgetMs: 600_000,
    fetch: (ctx) => {
      const retrievedAt = now();
      asOf = retrievedAt.slice(0, 10);
      return fetchNcuaQuarter({
        fetchImpl: fetch,
        requestSignal: () => ctx.requestSignal(),
        retrievedAt,
      });
    },
    parse: parseNcuaQuarter,
    validate: (rows, previous) => validateNcua(rows, previous, asOf),
  };
}
