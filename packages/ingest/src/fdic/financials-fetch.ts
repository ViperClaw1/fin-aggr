import { sha256Hex, type Source } from '../pipeline';
import {
  financialFieldProblems,
  financialsProbeUrl,
  financialsShapeUrl,
  financialsUrl,
  innerObjects,
  metaTotal,
  parseFdicFinancials,
  quoted,
  reportDate,
  validateFdicFinancials,
  type CallReport,
  type FdicFinancialsRaw,
} from './financials';

const PAGE_SIZE = 10_000;
const PAGE_CAP = 20;

function snapshotOf(raw: FdicFinancialsRaw, requestCount: number) {
  const bytes = new TextEncoder().encode(JSON.stringify(raw));
  return { sha256: sha256Hex(bytes), bytes, body: raw, requestCount };
}

interface FetchInput {
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  retrievedAt: string;
  pageSize?: number;
}

/** Latest report date, then every page of that quarter. The probe body is not stored. */
export async function fetchFdicFinancials(input: FetchInput) {
  const pageSize = input.pageSize ?? PAGE_SIZE;
  const probe = await input.fetchImpl(financialsProbeUrl(), {
    signal: input.signal,
    headers: { accept: 'application/json' },
  });
  if (!probe.ok) throw new Error(`fdic financials http ${String(probe.status)}`);
  const compact = quoted(innerObjects(await probe.text())[0] ?? '', 'REPDTE');
  if (compact === null || reportDate(compact) === null) throw new Error('fdic financials date');
  const responses: { url: string; body: string }[] = [];
  let offset = 0;
  let total = 0;
  let first = true;
  while (first || offset < total) {
    first = false;
    if (responses.length >= PAGE_CAP) throw new Error('fdic financials page cap');
    const url = financialsUrl(compact, offset, pageSize);
    const response = await input.fetchImpl(url, {
      signal: input.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`fdic financials http ${String(response.status)}`);
    const body = await response.text();
    total = metaTotal(body);
    const count = innerObjects(body).length;
    responses.push({ url, body });
    if (count === 0) break;
    offset += count;
  }
  return snapshotOf({ retrievedAt: input.retrievedAt, responses }, responses.length + 1);
}

export function fdicFinancialsSource(
  now: () => string,
  institutionIds: ReadonlySet<string>,
): Source<FdicFinancialsRaw, CallReport> {
  let asOf = now().slice(0, 10);
  return {
    id: 'fdic-financials',
    domain: 'bank_metrics',
    kind: 'official_api',
    fetch: (ctx) => {
      const retrievedAt = now();
      asOf = retrievedAt.slice(0, 10);
      return fetchFdicFinancials({ fetchImpl: fetch, signal: ctx.signal, retrievedAt });
    },
    parse: (raw) => parseFdicFinancials(raw, institutionIds),
    validate: (rows, previous) => validateFdicFinancials(rows, previous, asOf),
  };
}

export async function checkFinancialsShape(fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(financialsShapeUrl(), {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return `fdic financials shape http ${String(response.status)}`;
  const problems = financialFieldProblems(await response.text());
  if (problems.length > 0) return `fdic financials shape ${problems.join(' ')}`;
  return 'fdic financials shape ok';
}
